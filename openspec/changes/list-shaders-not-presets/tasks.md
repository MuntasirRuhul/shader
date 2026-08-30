## 1. List shaders

- [ ] 1.1 Change the library to render one entry per shader, labelled with the shader's name; verify four shaders produce four entries and that two shaders declaring a same-named preset remain distinguishable
- [ ] 1.2 Build an entry's preview from its shader's first preset, keeping the existing rules for colours inside a repeatable group, the excluded background, and the neutral placeholder; verify each still holds
- [ ] 1.3 Update the catalogue tests, which currently assert an entry per preset, to assert an entry per shader; verify they read the registry rather than a fixed list

## 2. Choosing a shader

- [ ] 2.1 Apply a chosen shader with its first preset — to the selection when there is one, otherwise as a new object that becomes the selection; verify both
- [ ] 2.2 Verify a preset other than the first is still reachable, by choosing the shader and then the preset in the parameter panel

## 3. Verify

- [ ] 3.1 Verify in the browser that the panel lists the shaders by name, that choosing one places it, and that its presets are chosen from the parameter panel
- [ ] 3.2 Verify the full root script set passes on a clean checkout
