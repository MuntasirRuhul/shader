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

## The shaders it ships

| Shader        | What it does                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Mesh gradient | Colour poles blended through a field-weighted OKLab average, with an animated warp                          |
| Metaball      | Drifting colour fields that merge where they meet, pulled together by Magnet and pushed apart by the cursor |
| Ribbon        | A drifting field sliced into coloured contour bands, seen through a glass lens                              |
| Soft gradient | A two-colour gradient with a slow animated warp                                                             |

Each is one file under `apps/studio/src/shaders/`, registered in
`registry.ts`. Nothing else knows they exist.

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

### State a shader owns between frames

Most shaders are pure functions of time; some are not. A manifest may declare
state and a function that advances it, which is where a simulation lives — the
metaball's wandering, mutually attracting balls, for instance.

```ts
simulation: {
  // The shape of the state, in the same vocabulary parameters use.
  schema: [{ name: 'phase', label: 'Phase', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01 }],
  initial: { phase: 0 },
  advance: (previous, { dt, elapsed, parameters, pointer, width, height }) => ({
    phase: (previous.phase as number) + dt * (parameters.speed as number),
  }),
},
```

What that buys, and what it costs:

- State is per object. Two objects filled by one shader drift independently.
- The advance runs once per frame, before drawing, and `dt` is real rendering
  seconds — so the motion is the same at any frame rate, and a suspension
  contributes nothing.
- What it returns binds exactly as parameters do, arrays and all, so a state
  value may not share a name with a parameter.
- It is a plain function: no document, no browser, no clock of its own. That is
  what lets a shader's motion be tested without a canvas.
- An advance that throws is reported against the shader and that object stops
  advancing; the rest of the canvas keeps drawing. One that consistently
  overruns the frame budget is reported too, rather than quietly costing frame
  rate.
- State is never saved. A reopened document starts from `initial`, which is
  correct for drifting motion and worth knowing before expecting an arrangement
  to come back where it was left.

`pointer` arrives in the object's own coordinates — the same space `vUv` uses,
so a shader reacting to the cursor behaves the same wherever the object sits,
at any rotation. It reports `present: false` when the pointer is elsewhere,
rather than holding its last position.

### Rendering through several passes

A shader may declare passes in order instead of a single program. Each has its
own fragment source and names what it reads: an earlier pass from this frame,
or any pass as of the previous one.

```ts
passes: [
  { name: 'field', fragmentSource: '...' },
  {
    name: 'surface',
    fragmentSource: 'void main() { outColor = texture(uField, vUv); }',
    reads: [{ uniform: 'uField', pass: 'field' }],
  },
],
```

Each pass runs once a frame, in order, through a target sized to the object;
only the last reaches the canvas. A pass reading its own previous frame is how
a simulation held on the GPU carries forward — the runtime swaps the buffers,
so the shader only ever sees "what I wrote last time", and the first frame
reads a cleared target rather than whatever was in memory. Every pass shares
the shader's parameters and state. Reading a pass that runs later is rejected
at registration.

A manifest declaring neither state nor passes behaves exactly as it did before
either existed, and allocates nothing extra.

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
| `Shift + 1`     | Fit every visible object into view               |
| `Shift + 2`     | Frame the selection                              |
| `Shift + 0`     | Return to actual size                            |
| Scroll          | Pan — hold `Cmd/Ctrl` to zoom                    |
| `Space` + drag  | Pan, whatever tool is active                     |
| `Alt` + drag    | Pan from anywhere                                |

Every canvas shortcut is suppressed while a text field has focus, so a bare
letter never fires mid-word. Space is the sharpest case of that rule: it pans
the canvas, and types a space into a text object being edited.

## The canvas

The canvas is unbounded. Objects store canvas coordinates, and panning and
zooming are properties of the view — nothing an object holds changes when you
move around it.

Everything the canvas shows is placed by that one view. That is worth stating
because it was once not true: the overlays were positioned through the viewport
and the shader layer was not, so the artwork separated from its own selection
box by exactly the pan and exactly the zoom. It agreed at 100% with no pan,
which is why it survived so long.

The view is applied where placement is still computed in double precision,
before it reaches the single-precision matrix the vertex stage reads. That is
what lets an object a million units from the origin be inspected at high
magnification without jittering: the large terms cancel before anything is
narrowed. Done on the graphics side they would not.

Zooming magnifies the work rather than redrawing it at another scale. A shader
is told its object's size in canvas pixels whatever the magnification, and the
fragment stage is evaluated per screen pixel — so an object is re-rendered as
you close in, not enlarged. Text masks are rasterized for the current
magnification for the same reason.

Behind it all is a ground of dots that follows the view, so panning across
empty space reads as movement. Its spacing steps by powers of two as
magnification crosses thresholds, which keeps it legible instead of collapsing
into a field or thinning to nothing. It is CSS beneath the transparent canvas,
not something the renderer draws: in the shader layer it would be a
full-surface pass every frame on a canvas whose whole idle strategy is to stop
drawing when nothing moves.

## Requirements

WebGL2. A browser without it gets an explicit message in place of the canvas
rather than a blank one.
