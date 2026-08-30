## Context

The repository is empty apart from OpenSpec scaffolding. The reference material is a set of standalone HTML experiments and one prototype builder (`studio.html`) that already validates the product shape but not its engineering: shaders there are self-registering closures that build their own panel DOM, all state is module-global, and nothing is typed or tested.

Two properties of that reference material constrain this design directly:

- The existing shaders are hand-written WebGL2 fragment shaders driven by many scalar, color, enum, and array uniforms. They are written full-screen: they read `gl_FragCoord.xy / u_resolution`. Any design that keeps them cheap to port must preserve raw GLSL authoring.
- Several shaders carry *repeatable* structures — mesh gradient poles, metaball balls, gradient stops — declared in GLSL as fixed-size uniform arrays with an active-count uniform. This pattern must survive into the parameter schema.

See `proposal.md` for motivation, and the seven capability specs for required behavior.

## Goals / Non-Goals

**Goals:**

- A shader is added by writing one declarative manifest and nothing else — no shell, inspector, or runtime edits.
- The design system is consumable independently of the application, with no path from a product surface to a literal visual value.
- Canvas interaction stays smooth during continuous drags without React re-rendering per frame.
- The document format and shader manifest are versioned and serializable from day one, so a sync backend can be added later without a format migration.
- Module boundaries follow dependency inversion: the canvas knows about a rendering *port*, not about WebGL; the inspector knows about a parameter *schema*, not about shaders.

**Non-Goals:**

- Node-graph or visual shader authoring. Shaders are authored as GLSL by developers; users compose and parameterize them.
- A general-purpose vector editor. Object types are deliberately limited to rectangle, ellipse, and text.
- Server persistence, authentication, and real-time collaboration. The interfaces are shaped to accept them; none ship here.
- Porting the remaining ten shaders. One shader proves the contract.

## Decisions

### Stack: React + TypeScript + Vite

React for the panel and inspector surfaces, TypeScript throughout, Vite for build and dev server, Vitest for unit tests.

*Why:* the interface is panel-heavy and component-shaped, which React handles well; the canvas is imperative and stays outside React entirely, so React's reconciliation never sits on the render path. Vite and Vitest share one config and transform pipeline.

*Alternatives:* Svelte or Solid would reduce re-render pressure, but the pressure is already avoided by keeping the canvas imperative, and React has the deepest pool of accessible headless primitives. A no-framework build was considered and rejected — the inspector's dynamic, schema-driven forms are exactly what a component model is for.

### Raw WebGL2, no rendering framework

The runtime talks to WebGL2 directly rather than through Three.js, PixiJS, or OGL.

*Why:* the existing shaders are full-screen fragment programs with bespoke uniforms. A scene framework would wrap them in its own material and render-loop abstractions, adding a layer to fight for a feature set — meshes, lighting, cameras — that a 2D shader canvas does not use. Direct WebGL2 also keeps the dependency surface small, which matters for long-term maintenance.

*Trade-off:* transforms, text rendering, and hit-testing must be written by hand. Each is bounded and specified, and hit-testing is done on the CPU anyway (below).

### Shader ABI: object-local UV, not screen coordinates

Every shader is compiled against a fixed preamble supplying `vUv` (object-local, 0–1), `uResolution` (the object's size in pixels), and `uTime` (seconds). Shaders read `vUv` rather than `gl_FragCoord`.

*Why:* an object is a transformed quad that may be rotated and may be one of several on screen. Screen-space `gl_FragCoord` cannot express "this shader fills this rotated rectangle" without per-object viewport tricks that break under rotation. A vertex-stage UV varying handles translation, scale, and rotation uniformly, and lets many objects share one program.

*Consequence:* porting a shader means replacing `gl_FragCoord.xy / u_resolution` with `vUv` — mechanical, and the main per-shader porting cost. It is named here so the task breakdown budgets for it.

*Alternative considered:* rendering each object to its own framebuffer at its own size, preserving screen-space authoring. Rejected — one framebuffer allocation and one extra composite pass per object, to avoid a one-line edit per shader.

### Text with a shader fill is masked, not re-rasterized in GLSL

Text objects rasterize their glyphs to an offscreen 2D canvas, which is uploaded as an alpha texture and multiplied against the shader's output as a mask on the object's quad.

*Why:* glyph rasterization in GLSL means signed-distance-field generation, atlas packing, and a font pipeline — a project of its own. Browser text rasterization is free, correct for every script, and already hinted. Re-rasterizing only when content, size, or font changes keeps it off the frame path.

*Trade-off:* the mask texture is resolution-dependent, so zooming far in softens edges until re-rasterization. Mitigated by re-rasterizing on zoom-level change past a threshold rather than every frame.

### Hit-testing on the CPU, analytically

Pointer targeting inverse-transforms the pointer into each object's local space and tests it against that object's analytic shape, walking the stacking order from front to back.

*Why:* it is exact, synchronous, and free of the pipeline stall that GPU color-picking readback causes. Rectangles and ellipses have closed-form containment tests; text uses its bounding box.

### State: one store, sliced by domain, with patch-based history

A single store composed of independent slices — document, selection, viewport, tools, panels — with undo/redo built from inverse patches produced by the immutable-update layer.

*Why:* the slices are separable but must be read together on the render path, and one store keeps that read cheap and consistent. Patch-based history records only what an edit touched, so undo cost is proportional to the edit, not to document size — the alternative, whole-document snapshots, grows linearly with the scene.

*Alternative:* the command pattern, with each edit implementing its own inverse. More explicit, but every new edit becomes two functions that can disagree; inverse patches are derived mechanically and cannot drift.

### Continuous drags bypass React

While a pointer drag or slider drag is in progress, values are written to a transient channel the renderer subscribes to directly. React re-renders on drag start and drag end only. One history entry is committed on release.

*Why:* this is the difference between a smooth canvas and a janky one. It also satisfies the specified behavior that a whole drag is a single undo step, since intermediate values never enter history.

### Design system as its own workspace package

The repository is a workspace with the design system, the shader core, and the application as separate packages. The design system depends on nothing in the application; the shader core depends on neither.

*Why:* the enforced direction of dependencies is what keeps the design system genuinely separate rather than nominally separate. It also means the shader core — manifests, schema, runtime — is publishable and testable headlessly, without a DOM.

### Tokens in TypeScript, emitted to CSS custom properties

Tokens are defined once in TypeScript, and a build step emits them as CSS custom properties for light and dark themes. Components style themselves with CSS Modules referencing those properties. A lint rule rejects literal colors and spacing in component styles.

*Why:* theme switching becomes a custom-property swap on a root element, with no re-render and no JavaScript on the styling path. Defining tokens in TypeScript keeps them typed and lets the build fail when a token lacks a value in one theme — which is a specified requirement.

*Alternative:* a compile-time CSS-in-JS library gives stronger type safety at the call site, at the cost of a heavier build and a smaller pool of familiarity. Rejected as unnecessary given the lint rule closes the same gap.

### Headless primitives from Radix, styled locally

Interactive primitives wrap Radix behavior with local styling; no third-party visual theme is adopted.

*Why:* focus management, dismissal semantics, and ARIA wiring are where hand-rolled component libraries fail accessibility audits, and they carry no visual opinion worth avoiding. Copy-in component kits were rejected because they arrive styled, and stripping their appearance costs more than styling unstyled primitives.

### Repeatable parameters map to fixed-size uniform arrays

A repeatable group declares a maximum entry count. The runtime binds the active entries and a count uniform, matching how the existing shaders already declare their arrays.

*Why:* it mirrors the GLSL the shaders are already written in, so no shader restructuring is needed. The declared maximum is mandatory in the schema precisely because the GLSL array must be sized at compile time.

### Document versioning with a forward-only migration chain

Documents carry a format version. Loading runs the document through migrations in sequence up to the current version; a version newer than the application is refused rather than partially read.

*Why:* users will hold exported files across releases. A chain of small, individually tested migrations is far easier to keep correct than a single function that must understand every historical shape.

### First port: the mesh gradient shader

*Why:* among the experiments it is the only one that exercises every part of the parameter vocabulary at once — a repeatable group of poles with per-entry position, color, and radius; scalar ranges; enumerated mask and dither modes; colors; and toggles. If the contract carries it, the vocabulary is proven; a simpler shader would leave the repeatable-group path untested.

## Risks / Trade-offs

- **Hand-rolled WebGL2 layer is the largest source of subtle bugs** (context loss, resource leaks, resize and device-pixel-ratio handling) → The runtime spec pins each of these as a testable requirement, and the runtime is isolated behind a port so it can be exercised headlessly with a mock rendering context.
- **Porting cost per shader was under-estimated by treating it as copy-paste** → The `vUv` ABI change is called out explicitly above; the one shader ported here establishes the real per-shader cost before the other ten are scheduled.
- **Text mask quality degrades under deep zoom** → Re-rasterize when the effective zoom crosses a threshold; accept softness between thresholds.
- **A draw call per object will not scale to very large scenes** → Acceptable at the intended scale of tens of objects. Batching objects that share a program is possible later without changing the document model or the shader contract.
- **Local persistence has a hard quota, and documents grow with repeatable-group data** → Persistence failures are a specified, user-visible state rather than a silent loss, and export remains available as the escape hatch.
- **A store shaped only around local editing can be awkward to retrofit for sync** → Edits are already expressed as patches, which is the same granularity a sync protocol needs; this is a deliberate hedge, not an accident.
- **Strict layering costs velocity early** → Accepted knowingly. The prototype's cost curve — where adding a shader means editing the shell — is the specific outcome this change exists to avoid.

## Migration Plan

Not applicable. This is the first change in an empty repository: there are no users, no deployed system, and no data to migrate. Rollback is reverting the branch.

## Open Questions

- Which typeface the design system ships with, and whether it is self-hosted or loaded from a font service. Affects tokens and the text mask pipeline's asset loading, but not the architecture or any specified behavior.
- Whether panel collapse and width preferences belong in the document or in per-device local settings once accounts exist. Local settings are correct for now; the answer only matters when a sync layer arrives.
- The exact zoom-delta threshold that triggers text mask re-rasterization. A tuning value to be set against real rendering, not a design decision.
