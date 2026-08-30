## 1. Specify the catalogue

- [ ] 1.1 Add tests asserting every shipped shader validates, declares at least one preset, resolves each preset to a complete value set, and reads object-local coordinates rather than the drawing surface; verify the suite runs against the catalogue rather than a fixed list, so a shader added later is covered without editing it
- [ ] 1.2 Add a test asserting each repeatable group's declared maximum equals the fixed size its GLSL allocates; verify it fails when a manifest's maximum is changed without its shader
- [ ] 1.3 Add tests for the library listing — an entry per preset, built-in shaders absent, and a built-in still resolvable from the registry for rendering; verify each
- [ ] 1.4 Add tests for entry previews covering colours inside a repeatable group, exclusion of a declared background colour, and the neutral placeholder when a preset carries no colours; verify each

## 2. Port the metaball shader

- [ ] 2.1 Port the metaball GLSL to the object-local coordinate contract, replacing the drawing-surface read and renaming the entry count to the one the runtime generates; verify the ported source declares no count parameter of its own
- [ ] 2.2 Author the metaball parameter schema — a repeatable group of up to 24 balls with position, radius, colour, and growth weight, plus the background and softness scalars; verify it passes manifest validation and that the group maximum matches the GLSL
- [ ] 2.3 Author the metaball presets, covering at least a default and one dense arrangement; verify each resolves to a complete value set
- [ ] 2.4 Register the metaball manifest; verify it appears in the library with one entry per preset and that no file outside the manifest and the registration was changed
- [ ] 2.5 Verify the ported shader renders, and that its still image matches the source experiment's default; confirm the runtime suspends drawing once it has been drawn, since the shader declares no time

## 3. Port the ribbon shader

- [ ] 3.1 Port the ribbon GLSL to the object-local coordinate contract, expressing the band and glass geometry as proportions of the object rather than in device pixels, and removing the device-ratio dependence; verify the ported source reads neither the drawing surface nor a device ratio
- [ ] 3.2 Author the ribbon parameter schema — a repeatable group of up to 8 colour stops plus the band, flow, and glass scalars and enumerations, grouped and ordered for the inspector; verify it passes manifest validation and that the group maximum matches the GLSL
- [ ] 3.3 Author the ribbon presets, covering at least a default and one contrasting arrangement; verify each resolves to a complete value set
- [ ] 3.4 Register the ribbon manifest; verify it appears in the library with one entry per preset and that no file outside the manifest and the registration was changed
- [ ] 3.5 Verify the ported shader renders and that its default preset matches the source experiment; re-tune the proportions where it does not, treating a visible difference as a defect in the port

## 4. Verify the contract held

- [ ] 4.1 Verify that adding both shaders required no change to the shader core, the design system, the runtime, or the inspector; report any file outside the manifests and their registration that had to change, as evidence the contract did not hold
- [ ] 4.2 Verify each shader end to end in the browser: place it, edit every parameter type it declares including adding and removing group entries, undo, reload, and confirm it returns
- [ ] 4.3 Verify the inspector generates a complete panel for each from its schema alone, with groups in the declared order and the entry limit explained at its maximum
- [ ] 4.4 Verify the full root script set passes on a clean checkout, and update the README's shader list to name the shaders the application now ships
