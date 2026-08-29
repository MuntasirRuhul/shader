## 1. Workspace and tooling foundation

- [x] 1.1 Initialize the workspace with packages for the design system, shader core, and application; verify the package manager resolves all workspaces and `install` completes cleanly
- [x] 1.2 Add TypeScript configuration with strict mode and project references across the three packages; verify a type error in one package fails the root typecheck command
- [x] 1.3 Add Vite build and dev-server configuration for the application package; verify the dev server starts and serves a placeholder page
- [x] 1.4 Add Vitest with a headless DOM environment and a shared setup file; verify a trivial test in each package runs from the root test command
- [x] 1.5 Add linting and formatting with import-boundary rules that forbid the design system and shader core from importing the application; verify a deliberate cross-boundary import fails lint
- [x] 1.6 Add a single root script set (`dev`, `build`, `test`, `typecheck`, `lint`) and a CI workflow running them; verify the workflow passes on a clean checkout

## 2. Design system package

- [x] 2.1 Define the token source in TypeScript covering color, spacing, radius, typography, elevation, and motion, with light and dark values; verify a token missing a value in either theme fails the token build
- [x] 2.2 Implement the build step emitting tokens as CSS custom properties per theme; verify the generated stylesheet contains every token in both themes
- [x] 2.3 Implement the theme provider with system-preference default, explicit override, and persistence; verify tests cover system default, live system change, explicit override, and restore after reload
- [x] 2.4 Add the lint rule rejecting literal color, spacing, radius, and typography values in component styles; verify a deliberate literal fails lint
- [x] 2.5 Build the primitives the application shell needs — button, icon button, and tooltip — on headless primitives; verify each renders from its declared inputs alone in isolation tests
- [x] 2.6 Add the keyboard and assistive-technology test suite covering reachability, activation, dismissal, visible focus, focus trapping and restoration, and exposed role, name, and state; verify it passes for every primitive built so far, and re-run it as later primitives land

## 3. Application shell

- [x] 3.1 Implement the three-region layout with slot-injected region content; verify the canvas stage absorbs remaining width and substituted content renders without shell changes
- [x] 3.2 Implement panel collapse and restore with persistence; verify a collapsed panel stays collapsed across reload and restores to its prior width
- [x] 3.3 Implement panel resizing with clamped minimum and maximum widths and persistence; verify dragging past a limit clamps and widths survive reload
- [x] 3.4 Implement the floating toolbar positioned over the canvas stage, staying within stage bounds as panels change and blocking pointer input only within its own bounds; verify both under panel collapse and resize
- [x] 3.5 Implement region labeling and keyboard order across the shell; verify tab order is consistent, focus is never trapped without a dismiss action, and each region is announced distinctly
- [x] 3.6 Implement the unsupported-environment state replacing the canvas stage, with rendering support supplied to the shell rather than detected by it; verify the message appears instead of a blank canvas when support is reported unavailable, and that the shell needs no rendering context to be tested

## 4. Shader manifest, schema, and registry

- [x] 4.1 Define the parameter schema types for numeric, boolean, color, enum, vector, and repeatable-group parameters, including group and ordering metadata; verify types compile and reject an unknown parameter type
- [x] 4.2 Define the shader manifest type with identity, display metadata, schema version, GLSL sources, parameter schema, and presets; verify a manifest supplying interface code fails to typecheck
- [x] 4.3 Implement manifest validation covering missing fields, unsupported parameter types, defaults outside declared ranges or option sets, repeatable groups missing a maximum, and unsupported schema versions; verify each failure produces an error naming the shader and the specific fault
- [x] 4.4 Implement preset validation and default-filling for omitted parameters; verify a preset with an out-of-range value is rejected and an incomplete preset resolves omitted parameters to defaults
- [x] 4.5 Implement the registry with registration, duplicate-identifier rejection, listing, and lookup by identifier; verify listing returns registered shaders and an unknown identifier reports not-found rather than a partial manifest
- [x] 4.6 Verify the parameter schema and presets round-trip through serialization unchanged

## 5. WebGL2 shader runtime

- [x] 5.1 Define the rendering port interface the canvas depends on, decoupled from WebGL; verify the application and document packages reference only this interface
- [x] 5.2 Implement context acquisition with an explicit unsupported result when WebGL2 is unavailable; verify the unsupported path is reported rather than throwing
- [x] 5.3 Implement the shader preamble supplying `vUv`, `uResolution`, and `uTime`, and the quad vertex stage producing the UV varying; verify a fixture shader renders correct object-local gradients under translation, scale, and rotation
- [x] 5.4 Implement program compilation and linking with failure reporting that includes the shader identifier and driver diagnostic; verify a deliberately broken shader reports both and leaves the application usable
- [x] 5.5 Implement the per-context program cache; verify one program is compiled when several objects share a shader and that reselecting a shader reuses the cache
- [x] 5.6 Implement schema-driven uniform binding for every parameter type, including repeatable groups bound as fixed-size arrays with an active-count uniform; verify bindings are set from values with no shader-specific code and that changing entry count does not recompile
- [x] 5.7 Implement the shared animation loop with display synchronization, idle suspension when nothing animates, and suspension while the document is hidden; verify frames stop when idle or hidden and resume on change or visibility
- [x] 5.8 Implement the elapsed-time source so animation speed is frame-rate independent and resumes without a jump after suspension; verify both properties under simulated frame-rate variation and a suspend-resume cycle
- [x] 5.9 Implement drawing-surface sizing at device pixel ratio with a configured maximum, responding to size changes; verify output matches after resize and that the ratio is capped
- [x] 5.10 Implement context-loss and restore handling that suspends draws, surfaces a message, and recreates resources on restore; verify the scene and parameter values are unchanged across a simulated loss and restore
- [x] 5.11 Implement resource release for removed objects and unused shaders, and full teardown on unmount; verify no graphics resources remain allocated after each

## 6. Document model and state

- [x] 6.1 Define the document model — objects with identifier, type, position, size, rotation, opacity, visibility, locked state, and fill, plus explicit stacking order; verify identifiers are unique on insert and order survives removal
- [x] 6.2 Implement rectangle, ellipse, and text object types, with text carrying content and type settings; verify each type constructs with the common properties and text carries its content
- [x] 6.3 Implement solid and shader fills, with shader fills holding per-object parameter values; verify two objects using one shader keep independent values
- [x] 6.4 Implement the unresolved-fill state for a fill referencing an unregistered shader; verify the document still loads and stays editable with the missing shader named
- [x] 6.5 Implement the store with document, selection, viewport, tool, and panel slices; verify each slice updates independently and the store composes them
- [x] 6.6 Implement selection covering single, additive, and cleared selection, removal from selection on delete, and locked objects falling through; verify each case
- [x] 6.7 Implement stacking-order operations and verify raising an object changes which object draws on top
- [x] 6.8 Implement patch-based undo and redo, including the redo stack clearing on a new edit; verify undo restores the prior state and redo reapplies
- [x] 6.9 Implement the transient channel that bypasses React during continuous drags and commits one history entry on release; verify a multi-value drag produces exactly one undo step and no React re-render between start and end

## 7. Canvas surface and tools

- [x] 7.1 Mount the rendering surface and drive the scene from the document in stacking order; verify objects render in order with their fills
- [x] 7.2 Implement the text mask pipeline rasterizing glyphs offscreen and multiplying them against shader output, re-rasterizing on content, size, font, and zoom-threshold changes; verify a text object renders with a shader fill and re-rasterizes only on those changes
- [x] 7.3 Implement CPU hit-testing with inverse transforms and analytic shape tests, respecting stacking order, visibility, and locked state; verify targeting under overlap, on hidden objects, and on rotated objects
- [x] 7.4 Implement the tool state machine with exactly one active tool, select as the default, toolbar indication, and keyboard shortcuts suppressed while a text input has focus; verify each
- [x] 7.5 Implement the select tool — click selection, click-to-clear, marquee selection of enclosed unlocked visible objects, selection dragging, and cursor feedback; verify each case
- [x] 7.6 Implement transform handles for resize with opposite-corner anchoring, aspect-constrained resize, rotation about center, and a bounding indicator for multiple selection; verify each
- [x] 7.7 Implement the shape tool with drag-out preview, constrained equal sides, selection and return to select on creation, and no object on a zero-area drag; verify each
- [x] 7.8 Implement the text tool with click-to-create entering editing, commit on confirm or click-away, discard when left empty, and double-click to edit an existing text object; verify each
- [x] 7.9 Implement viewport pan and zoom about the pointer with clamped limits, a displayed zoom level, and zoom-to-fit; verify object positions are unchanged by panning and limits clamp
- [x] 7.10 Implement keyboard movement by fine and coarse steps and deletion as a single undoable step, both suppressed while a text input has focus; verify each

## 8. Inspector and parameter panel

- [x] 8.1 Build the inspector's value primitives — slider, numeric input, text input, toggle, select, and color picker — on headless primitives; verify each renders from its declared inputs alone in isolation tests
- [x] 8.2 Build the inspector's container primitives — popover, collapsible, and scroll area — on headless primitives; verify each renders from its declared inputs alone and that the accessibility suite from 2.6 passes for every primitive
- [ ] 8.3 Implement schema-driven control generation for the selected object's shader; verify a shader registered by a test with no inspector changes renders complete controls
- [ ] 8.4 Implement the control mapping for numeric, boolean, color, enum, and vector parameters honoring declared ranges, steps, and options; verify each type renders its control with its constraints applied
- [ ] 8.5 Implement input validation clamping out-of-range values and reverting unparseable input without modifying the document; verify both
- [ ] 8.6 Implement repeatable-group editing with add, remove, and reorder up to the declared maximum, and an explained unavailable state at the maximum; verify each and that remaining entries keep values
- [ ] 8.7 Wire control edits to live canvas updates through the transient channel; verify the canvas updates continuously during a slider drag and values persist to the document
- [ ] 8.8 Implement parameter grouping with collapsible groups and per-shader collapse persistence; verify declared order is preserved and collapse survives reselecting the shader
- [ ] 8.9 Implement per-parameter and reset-all defaults, with reset-all as one undoable step and an at-default indication; verify each
- [ ] 8.10 Implement preset selection applying values as a single undoable step; verify controls and canvas update and edited values are replaced
- [ ] 8.11 Implement the empty, multiple-selection, and solid-fill panel states including the affordance to replace a solid fill with a shader; verify each state
- [ ] 8.12 Implement the signed-out profile placeholder and donate affordance at the top of the inspector; verify they render without any authentication or network dependency

## 9. Persistence, import, and export

- [ ] 9.1 Implement versioned document serialization and deserialization; verify a document round-trips equivalently in objects, order, fills, and parameter values
- [ ] 9.2 Implement the migration chain for older supported versions and refusal of newer versions naming both; verify an older document migrates without user action and a newer one is refused rather than partially loaded
- [ ] 9.3 Implement rejection of documents containing unrecognized object types, naming the type; verify the object is not silently discarded
- [ ] 9.4 Implement local persistence and restore on return; verify the document is restored at the last persisted point
- [ ] 9.5 Implement persistence failure handling for unavailable or full storage, and recovery from unparseable stored data; verify the user is informed, the application stays usable with export available, and an unparseable store starts an empty document
- [ ] 9.6 Implement file export and import, including refusal of invalid files leaving the current document untouched and confirmation before replacing unsaved work; verify each
- [ ] 9.7 Verify an exported file imports back into an equivalent document

## 10. Mesh gradient shader port

- [ ] 10.1 Port the mesh gradient GLSL to the `vUv` ABI; verify the ported shader compiles and renders equivalently to the reference experiment
- [ ] 10.2 Author the mesh gradient parameter schema covering the repeatable pole group with per-entry position, color, and radius, plus scalar, color, enum, and boolean parameters; verify it passes manifest validation
- [ ] 10.3 Author the mesh gradient presets and register the manifest; verify presets validate and the shader appears in the library with no shell, inspector, or runtime changes
- [ ] 10.4 Verify the full pipeline end to end: create an object, apply the mesh gradient, edit every parameter type including adding and removing poles, undo and redo, export, reload, and import

## 11. Integration verification

- [ ] 11.1 Verify a second, minimal fixture shader registered only in tests renders and generates controls with no changes outside its manifest, proving the open-closed contract
- [ ] 11.2 Verify the accessibility pass across shell, toolbar, and inspector — keyboard-only operation of every control, focus restoration, and region announcement — in both themes
- [ ] 11.3 Verify theme switching leaves no element unreadable or without a focus indicator across every surface
- [ ] 11.4 Verify continuous interaction performance: dragging a slider and dragging an object each sustain smooth updates without per-frame React re-renders
- [ ] 11.5 Verify the full root script set passes on a clean checkout and document the development workflow in the repository README
