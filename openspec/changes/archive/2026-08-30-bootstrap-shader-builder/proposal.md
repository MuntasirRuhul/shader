## Why

A set of ~11 standalone HTML shader experiments exists, plus one prototype builder (`studio.html`) that already proves the core idea: a browsable shader library, a live canvas, and a parameter panel. But every shader in that prototype hand-writes its own control panel DOM, all state is global, and nothing is testable, typed, or reusable. Adding a shader means editing the shell; adding a feature means touching every shader.

This change replaces that prototype with a real application foundation: a typed shader plugin contract, an object-based canvas, a design system, and one shader ported end-to-end to prove the pipeline. Everything after this is additive.

## What Changes

- **Project scaffolding**: TypeScript + React + Vite application in this repository, with linting, formatting, unit tests, and CI-ready scripts.
- **Design system package**: a token layer (color, spacing, radius, typography, motion) with light and dark themes, plus styled primitives built on headless accessible components. No product code styles itself directly.
- **Application shell**: the three-region layout — left shader library panel, center canvas stage, right inspector panel — plus the floating canvas toolbar. Panels are slot-driven and independently collapsible.
- **Shader plugin contract**: shaders become declarative manifests (metadata, GLSL sources, typed parameter schema, presets) instead of imperative panel-building code. Registering a shader requires no changes to the shell.
- **WebGL2 shader runtime**: program compilation and caching, uniform binding driven by the parameter schema, a single shared render loop, and context-loss recovery.
- **Object canvas**: a scene graph of rectangles, ellipses, and text with transforms, z-order, and selection. A shader is a *fill* applied to an object, not a fixed fullscreen background.
- **Canvas tools**: select, shape, and text tools as an explicit state machine driven from the floating toolbar, with pan and zoom on the viewport.
- **Manifest-driven inspector**: the right panel renders controls automatically from a shader's parameter schema. No shader ships panel code.
- **Document model with import/export**: the canvas serializes to a versioned JSON document, persisted locally and exportable/importable as a file. The document format is designed for later server sync but this change ships no backend.
- **One shader ported end-to-end**: the mesh gradient shader from the existing experiments, expressed purely as a manifest, proving the contract carries a real shader with colors, ranges, enums, and repeatable items.

Non-goals for this change, deliberately deferred: user accounts and authentication (the inspector shows a signed-out placeholder and a donate affordance only), server sync, the remaining ten shader ports, video/image export, and multi-user collaboration.

## Capabilities

### New Capabilities

- `design-system`: Design tokens, theming (light/dark), and the accessible UI primitive layer that all product surfaces are built from.
- `app-shell`: The application frame — three-region layout, panel behavior, floating toolbar placement, and keyboard-reachable structure.
- `shader-registry`: The declarative shader manifest contract, parameter schema vocabulary, preset format, and the registry that discovers and validates shaders.
- `shader-runtime`: WebGL2 program compilation, uniform binding from parameter values, the shared render loop, and context-loss recovery.
- `canvas-document`: The scene graph and versioned document model — object types, transforms, z-order, selection state, serialization, local persistence, and file import/export.
- `canvas-tools`: The tool state machine — select, shape, and text — including hit-testing, object creation, transform manipulation, and viewport pan/zoom.
- `parameter-panel`: Generating inspector controls from a shader's parameter schema, including value editing, reset, and preset application.

### Modified Capabilities

None. This is the first change in a new project; no specs exist yet.

## Impact

- **Repository**: introduces the entire application source tree, currently empty apart from OpenSpec scaffolding.
- **Dependencies**: adds React, TypeScript, Vite, a headless component library, a state management library, and a test runner. No rendering framework wrapper — WebGL2 is used directly so the existing GLSL ports unchanged.
- **Reference material**: the experiments in the local `Test` folder are the source for shader ports; only the mesh gradient is ported here. They are read-only references and are not moved into this repository.
- **Future backend**: the document model and shader manifest are versioned and serializable from the outset so that a sync layer can be added without a format migration. No network code ships in this change.
- **Browser support**: requires WebGL2. Browsers without it get an explicit unsupported state rather than a blank canvas.
