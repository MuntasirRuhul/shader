## Context

The shader contract treats a manifest as pure data. See `proposal.md` for why that fails; the short version is that the motion in most of the reference shaders lives in per-frame host code, not in the fragment program.

Three things constrain the approach.

The runtime already owns a single shared animation loop, a program cache, and uniform binding driven by the parameter schema. All three extend naturally; none needs replacing.

The `vUv` contract means a shader addresses its own object, not the screen. Anything added here — pointer input especially — has to arrive in the same frame of reference or the coupling the contract removed comes back.

The existing shaders must keep working untouched. State and passes are optional, and a manifest declaring neither has to take exactly the path it takes today.

## Goals / Non-Goals

**Goals:**

- Carry the metaball faithfully, with its real controls, as the measure of whether this worked.
- Keep the inspector generating itself. Parameters stay declarative; only simulation becomes code.
- Keep a shader's motion testable without a canvas.

**Non-Goals:**

- A general-purpose effect graph. Passes are a list, not a graph, because every reference shader is a list and a graph costs a scheduler, cycle detection, and a UI nobody asked for.
- Physics. The runtime advances whatever the shader returns; it has no opinion about what the state means.
- Running an advance anywhere but the main thread. That is a real option later and a distraction now.

## Decisions

### Simulation is a function on the manifest, not a declarative description

A manifest carries `update(previous, context) → next`. It is plain JavaScript, receives elapsed time, parameter values, and pointer input, and returns values bound as uniforms.

*Why:* the alternative was describing simulation as data — forces, damping, emitters — which the runtime would interpret. That is a far larger design, it constrains shaders to the behaviours the vocabulary anticipated, and the first shader outside them forces the escape hatch anyway. The reference shaders already express their motion as small functions; accepting that shape costs one field and covers all of them.

*What it costs:* manifests stop being serialisable, which is what made "pure data" attractive. A shader can no longer be sent over a network as JSON. Nothing today does that, and if it ever matters the parameters and presets — the parts a user edits — are still data; only the shader's own code is not, and code was always going to be code.

### Advance runs before drawing, once per frame, per object

The loop advances every object's state, then draws. State lives with the object, not the shader.

*Why per object:* two objects using one shader are two independent instances of the same effect. Sharing state would make one object's drift visible in the other, which is not what "the same shader" means.

*Why before drawing:* the alternative is drawing then advancing, which shows the initial state for one frame and lags by one frame forever after.

### State values bind exactly as parameter values do

An advance returns a record of values, and the existing uniform binding handles it — same types, same rules, same array packing for repeatable groups.

*Why:* the metaball's state is 24 positions, radii, and weights. That is precisely the shape the parameter binding already packs for repeatable groups. Building a second binding path would duplicate the fiddliest code in the runtime for no gain.

*Consequence:* a state value and a parameter cannot share a name, which validation rejects rather than leaving one to silently win.

### Passes are a list, and a pass may read its own last frame

A manifest declares passes in order. Each declares what it reads: an earlier pass, or itself as of the previous frame.

*Why a list:* the ink studio is field then dither. The water ripple is simulate then refract. Neither branches. A list is enough for every shader in the folder, and it makes "read something that does not exist yet" a position check rather than a graph traversal.

*Why self-reads earn their place:* the water ripple's height field lives in two textures it swaps. Expressed as "this pass reads what it wrote last frame", the runtime does the swapping and the shader never sees two buffers. Without it, GPU-resident simulation is impossible and the ripple cannot be ported at all.

*First frame:* a self-read gets a cleared target rather than whatever was in memory, so a shader starts from a defined state instead of noise.

### Pointer input arrives in the object's coordinates

The advance receives the pointer in the same space `vUv` uses, plus whether it is over the object at all.

*Why:* a shader that reacted to screen coordinates would behave differently depending on where its object sits, which is the coupling this contract exists to remove. Expressing it in object space means the metaball's cursor repulsion works identically wherever the object is, at any rotation.

*Absent rather than stale:* when the pointer leaves, the advance is told it is absent. Holding the last position would leave the metaball permanently fleeing a cursor that is not there.

### A failing advance is contained, not fatal

An advance that throws is reported and disabled for that object; the rest of the canvas keeps rendering.

*Why:* an advance is shader-supplied code running every frame. Letting one throw take down the loop would mean one bad shader stops the whole canvas, including objects that have nothing to do with it. The same reasoning already governs a shader that fails to compile.

## Risks / Trade-offs

- **A slow advance costs frame rate directly, and the shader author feels it last** → The runtime measures advances and reports one that consistently overruns, against the shader, so it reads as a shader defect rather than a mysteriously janky canvas.
- **Manifests stop being serialisable** → Named above. Parameters and presets stay data; only the code is code.
- **Targets multiply with objects × passes** → They follow object size and are released with the object, on the same path programs already use. A single-pass shader allocates none.
- **State makes a document's appearance time-dependent** → A reopened document starts from the declared initial state, not where it was left. Correct for drifting motion, and worth knowing before someone expects a saved arrangement to persist.
- **`update` is an escape hatch that could absorb work belonging in GLSL** → Real, and not preventable by design. The spec confines it to advancing state, and review is what keeps rendering out of it.

## Migration Plan

Nothing to migrate. State and passes are optional; a manifest declaring neither takes the path it takes today, which the existing shaders' tests already assert. No document format change: state is per-session, never persisted.

## Open Questions

None.
