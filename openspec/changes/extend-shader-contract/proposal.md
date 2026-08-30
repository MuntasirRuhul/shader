## Why

The shader contract assumes a shader is pure data: parameters in, one fragment program, pixels out. That assumption holds for a gradient and fails for almost everything else in the reference material.

The metaball is the clearest case. Its motion is a simulation — balls follow a slowly-turning heading, attract each other, and flee the cursor — integrated in JavaScript each frame and handed to the program as positions. Ported under the current contract it renders, but stands still, and its real controls (Count, Size, Blur, Magnet, Speed) cannot be expressed at all, because they govern a simulation the contract has no place for. What shipped is a shader wearing the metaball's name with per-ball editing the original never had.

The same shape appears throughout. The ink blob studio ages a trail of points in JavaScript and draws circles from it, then renders through a second pass so the dither and surface threshold work on a finished field. The water ripple keeps its height field in two textures it swaps between frames, and a second pass refracts an image through the slope. None of these are unusual; they are how this kind of shader is built.

Two capabilities are missing, and together they account for every remaining experiment.

## What Changes

- **A shader may own per-frame state.** A manifest may declare an initial state and a function that advances it — given elapsed time, its parameter values, and pointer input — returning values the program reads as uniforms. The metaball's wander and magnet, the ink trail's ageing, and any particle behaviour live here.
- **A shader may declare several passes.** A pass renders to a texture that a later pass reads, and a pass may read what it wrote on the previous frame. The first covers a field followed by a dither or surface treatment; the second covers a simulation held on the GPU, as the water ripple's height field is.
- **Re-port the metaball faithfully**, with the controls the experiment actually has, as the proof that the extended contract carries a real shader rather than an easy one.
**BREAKING**: manifests stop being pure data. A shader that owns state ships a function, which the current contract forbids. This is deliberate: the purity was an assumption about the domain, and the domain disagrees. Parameters, presets, and grouping stay declarative, so the inspector still generates itself; only simulation becomes code, and it is plain, DOM-free, and testable.

Not in scope: image parameters, which the ascii-dither and water-ripple shaders also need; exporting a shader as a snippet a user can paste into their own project; and correcting the library to list shaders rather than presets. Each is real and each is a change of its own.

## Capabilities

### New Capabilities

- `shader-simulation`: What a shader that owns per-frame state must satisfy — how state is declared and advanced, what an update may depend on, and what the runtime guarantees about when and how often it runs.

### Modified Capabilities

- `shader-registry`: a manifest may declare state and passes, so the contract and its validation grow to cover both. The rule that a manifest supplies no interface code stays; the rule that it supplies no code at all does not.
- `shader-runtime`: rendering becomes a sequence of passes with intermediate targets, and the frame gains a state-advance step before drawing.

## Impact

- **Shader core**: the manifest type and its validation, and the runtime's frame loop and target management. The parameter schema is unaffected.
- **Application**: the metaball manifest is rewritten. No panel changes.
- **Existing shaders**: unaffected. State and passes are optional, and a manifest declaring neither behaves exactly as it does today — which is the migration.
- **Risk**: a shader's update function runs every frame, so a slow one costs frame rate directly. The runtime bounds what an update may do and reports one that overruns, rather than letting a shader quietly make the canvas stutter.
- **Risk**: intermediate render targets consume memory per shader and per object. The runtime shares and releases them, as it already does for programs.
