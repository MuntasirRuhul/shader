# Shader Builder

Compose objects on a canvas and fill them with parameterized GLSL shaders.

Shaders are declared as data. A shader is added by writing one manifest —
metadata, GLSL, a typed parameter schema, and presets — and nothing else: the
library lists it, the runtime compiles and binds it, and the inspector builds
its complete control panel, all without a line of code changing anywhere else.

## Getting started

```bash
npm install
npm run dev
```

The application runs at http://localhost:5173.

## Scripts

Every script runs from the repository root.

| Script                  | What it does                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| `npm run dev`           | Builds tokens, then starts the application with hot reloading        |
| `npm run build`         | Builds tokens, typechecks every package, and bundles the application |
| `npm test`              | Runs every test suite once                                           |
| `npm run test:watch`    | Runs tests and re-runs them as files change                          |
| `npm run test:coverage` | Runs the tests and reports coverage                                  |
| `npm run typecheck`     | Typechecks every package through its project references              |
| `npm run lint`          | ESLint over the source, Stylelint over the stylesheets               |
| `npm run lint:fix`      | The same, applying what can be fixed automatically                   |
| `npm run format`        | Formats with Prettier                                                |
| `npm run format:check`  | Fails if anything is unformatted                                     |
| `npm run verify`        | Lint, format check, typecheck, and tests — what CI runs              |
| `npm run build:tokens`  | Regenerates the design tokens stylesheet                             |

Run `npm run verify` before pushing. It is exactly what CI runs.

## How the code is arranged

```
packages/shader-core/     Shader manifests, the registry, the document model,
                          the WebGL2 runtime, and persistence. No React, no DOM
                          — it is tested headlessly in node.

packages/design-system/   Design tokens, theming, and accessible primitives.
                          Depends on nothing else in the repository.

apps/studio/              The application: shell, canvas, inspector, shaders.
```

Dependencies point one way only, and lint enforces it: the design system and
the shader core cannot import the application, the design system cannot import
the core, and the core cannot import React at all. That last rule is what keeps
it testable without a DOM.

## Adding a shader

Write a manifest and register it. That is the whole procedure.

```ts
// apps/studio/src/shaders/myShader.ts
import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from '@shader/core';

export const myShaderManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'my-shader',
  name: 'My shader',
  category: 'Gradients',

  fragmentSource: `
void main() {
  outColor = vec4(mix(low, high, vUv.x), 1.0);
}
`,

  parameters: [
    { name: 'low', label: 'Low', type: 'color', group: 'Colour', defaultValue: '#000000' },
    { name: 'high', label: 'High', type: 'color', group: 'Colour', defaultValue: '#ffffff' },
  ],

  presets: [{ id: 'default', name: 'Default', values: {} }],
};
```

Then add it to `apps/studio/src/shaders/registry.ts`.

### What a shader can rely on

The runtime supplies a preamble, so a manifest declares none of this itself:

| Name          | Meaning                                            |
| ------------- | -------------------------------------------------- |
| `vUv`         | Object-local coordinates, `0..1` across the object |
| `uResolution` | The object's size in pixels                        |
| `uTime`       | Seconds elapsed, advancing only while rendering    |
| `outColor`    | The fragment output                                |

Read `vUv`, never `gl_FragCoord`. An object is a transformed quad that may be
rotated and may be one of many on screen, so screen coordinates cannot express
which rectangle a shader is meant to fill. Porting a full-screen shader is
usually a matter of replacing `gl_FragCoord.xy / u_resolution.xy` with `vUv`.

Each parameter becomes a uniform of the same name. An `integer: true` number
binds as a GLSL `int`, and an enum binds as an `int` index, so both need an
explicit `float(...)` where they meet float maths.

A repeatable group named `poles` with an entry parameter `color` binds as
`poles_color[N]`, alongside `poles_count`. The array is sized at the group's
declared `maxEntries`, because GLSL sizes arrays at compile time — which is why
that maximum is required rather than optional.

## The design system

Every visual value resolves from a token. Tokens are defined once in
`packages/design-system/src/tokens/tokens.ts` and emitted to CSS custom
properties for both themes; the build fails if a themed token is missing a
theme.

Two lint layers keep literals out of component styles — a custom ESLint rule
for JSX style objects, and Stylelint for CSS Modules. Both reject a literal
colour, spacing, radius, or typography value:

```css
/* Rejected */
color: #4d7cff;

/* Correct */
color: var(--sb-accent-solid);
```

Theming switches by a `data-theme` attribute on the root element: no re-render,
and no JavaScript on the styling path.

## Keyboard

| Key             | Action                                           |
| --------------- | ------------------------------------------------ |
| `V` / `R` / `T` | Select, shape, and text tools                    |
| Arrows          | Move the selection; hold Shift for a larger step |
| `Delete`        | Remove the selection                             |
| `Escape`        | Clear the selection                              |
| `Cmd/Ctrl + Z`  | Undo — `Shift` to redo                           |
| `Shift + 1`     | Fit the content into view                        |
| `Shift + 0`     | Return to actual size                            |
| Scroll          | Pan — hold `Cmd/Ctrl` to zoom                    |
| `Alt` + drag    | Pan from anywhere                                |

Every canvas shortcut is suppressed while a text field has focus, so a bare
letter never fires mid-word.

## Requirements

WebGL2. A browser without it gets an explicit message in place of the canvas
rather than a blank one.
