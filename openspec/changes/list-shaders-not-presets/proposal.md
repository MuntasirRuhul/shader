## Why

The library lists one entry per preset. Four shaders produce sixteen cards, three of them called "Ember" and two called "Still", each showing only the preset's name — so entries collide and nothing distinguishes them but their swatch colours.

The reasoning behind it was that a preset is what a user recognises and picks. That is true once you know which shader you are looking at, and the panel never says. A shader is the thing being chosen; a preset is a starting point within it, and belongs beside the controls it sets, where the panel already puts it.

## What Changes

- **The library lists shaders**, one entry each, labelled with the shader's name.
- **Choosing a shader** applies it with its first preset, exactly as choosing that preset does today — to the selection if there is one, otherwise as a new object.
- **A preset is chosen in the parameter panel**, which already offers them at its head. Nothing moves; the library simply stops duplicating the choice.
- **The entry preview** is built from the shader's first preset, using the colours it actually carries.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `shader-library`: the requirement that the library presents each preset as its own entry is replaced by one presenting each shader as its own entry. Choosing an entry behaves as before, and the preview and built-in exclusion rules are unchanged.

## Impact

- **Application**: the library panel and the function that builds an entry's preview. The inspector is untouched — it already offers presets at the head of the panel.
- **Shaders**: unaffected. Presets stay exactly as declared; only where they are chosen changes.
- **Documents**: unaffected. An object still records which shader and which preset it carries.
- **What is lost**: reaching a non-default preset now takes two steps — choose the shader, then choose the preset — where it took one. That is the cost of an entry that says what it is, and it stops the library growing by four cards for every shader added.
