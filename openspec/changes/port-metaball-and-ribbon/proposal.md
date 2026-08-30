## Why

One shader has been ported to the manifest contract. One port proves the contract works; it does not prove it scales. Two more — chosen because they exercise the parameter vocabulary differently from the mesh gradient — turn "it worked once" into evidence, and they do it before any further capability is built on top of an unproven foundation.

The catalogue itself is also unspecified. What every shipped shader must satisfy currently lives only in a test file, so the rules a future port has to meet are discoverable only by reading test code.

## What Changes

- **Port the metaball shader** from the local `metaball-shader-control` experiment. A repeatable group of up to 24 balls, each with a position, radius, colour, and growth weight, blended through the same field-weighted OKLab average the mesh gradient uses.
- **Port the ribbon shader** from the local `Ribbon` experiment. A repeatable group of up to 8 colour stops plus roughly a dozen scalar and enumerated parameters governing the band, its flow, and the glass distortion over it.
- **Specify the shipped catalogue**: what every shader in the library must satisfy, so the rules are written down rather than implied by tests.

Two properties of these shaders are worth naming now, because they are not defects to be fixed during the port:

The metaball shader declares no time uniform. In the original experiment the animation came from JavaScript moving the balls between frames, not from the shader. Ported faithfully it is a still image, and the runtime's idle suspension will correctly stop drawing it. Adding motion would be inventing behaviour the source does not have.

The ribbon shader works in device pixels and takes a device pixel ratio uniform. The runtime's contract supplies object-local coordinates and an object size, deliberately, so that one shader fills one object however the display is scaled. The port expresses the same geometry in those terms rather than extending the contract for one shader.

Not in scope, and each for a stated reason: the gradient-stripe shader needs repeatable groups nested inside repeatable groups, which the parameter schema does not express; the ascii-dither, water-ripple, and liquid-chrome shaders need an image parameter and the document storage behind it; and the fluid, chrome-type, and liquid-chrome shaders need multi-pass rendering with feedback buffers. Each is a change of its own, with a cost worth seeing before it is committed to.

## Capabilities

### New Capabilities

- `shader-library`: What the catalogue of shipped shaders must satisfy — that each one validates, presents itself in the library, and honours the runtime's contract — independent of what any individual shader draws.

### Modified Capabilities

None. Adding a shader is adding data: it changes nothing about how the registry, runtime, or inspector behave. That this is true is the contract working, and `shader-library` is where it is now written down.

## Impact

- **Application**: two new manifests under the studio's shader directory, and their registration. No change to the shader core, the design system, the runtime, or the inspector — if any of those need editing, the contract has failed and that is worth stopping over.
- **Library**: the shader list grows from one user-facing shader to three, and from four presets to roughly ten.
- **Reference material**: the experiments in the local `Test` folder are the source. They are read-only references and are not moved into this repository.
- **Risk**: both shaders index a fixed-size uniform array, so each declares a maximum entry count matching what its GLSL allocates. Getting that pair out of step is the one way a manifest can be internally inconsistent while still validating.
