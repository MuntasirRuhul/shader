## Context

The manifest contract, the runtime, and the inspector are in place and specified; one shader has been ported through them. See `proposal.md` for why two more, and `openspec/specs/shader-registry/spec.md` for the contract they must satisfy.

Three properties of the source experiments shape the work, and each is settled below rather than during coding:

The metaball shader declares no time uniform. Its original animation came from JavaScript rewriting ball positions between frames.

The ribbon shader is written in device pixels and takes a device pixel ratio uniform, which the runtime's contract does not supply.

The ribbon shader declares `u_stopCount` beside `u_stops[8]`, and the metaball shader declares `u_count` beside its arrays. The runtime already generates a count uniform for every repeatable group.

## Goals / Non-Goals

**Goals:**

- Two shaders added as manifests, with nothing outside their own files changed. If anything else needs editing, the contract has failed and that is the finding.
- Faithful ports: what the experiments draw is what the builder draws.
- The catalogue's invariants enforced by specification rather than by convention.

**Non-Goals:**

- Improving the shaders. A port that "fixes" its source produces a different shader and loses the comparison that makes it a port.
- Extending the shader contract. Every decision below stays inside what the runtime already offers; if one could not, that would be grounds to stop and propose the extension separately.

## Decisions

### The count uniform comes from the group, not from the manifest

Neither manifest declares a parameter for its entry count. The runtime generates `balls_count` and `stops_count` from the repeatable groups themselves, and the ported GLSL reads those.

*Why:* a count declared as a parameter would be a second source of truth for how many entries exist, editable to a value that disagrees with the array the inspector maintains. The group already knows its length.

*Consequence:* the ported source renames `u_count` to `balls_count` and `u_stopCount` to `stops_count`. Mechanical, and it removes two controls a user should never have seen.

### The ribbon's geometry is expressed against the object, not the device

The port replaces the device pixel ratio uniform and its device-pixel arithmetic with the object-local coordinates and object size the runtime supplies.

*Why:* the contract's whole point is that one shader fills one object identically however the display is scaled. A shader reading the device pixel ratio would render differently on a high-density display for the same document, which is the coupling `vUv` exists to remove — and the runtime already renders at the device ratio, so the shader compensating for it a second time would double-apply the scaling.

*Alternative considered:* adding a device-ratio uniform to the shared preamble. Rejected: it would let any shader reintroduce exactly the display dependence the contract removes, to serve one shader that does not need it. The glass distortion is a proportion of the object, and is expressible as one.

*Consequence:* effects the source sized in pixels — corner radius, band width, glow falloff — become fractions of the object's size. Values are re-tuned so the default preset matches the experiment; that re-tuning is the substance of this port.

### The metaball shader is ported still

The metaball manifest declares no speed or time parameter, and its GLSL reads no elapsed time.

*Why:* the source shader has none. Its motion lived in the host page. Inventing a motion parameter would mean designing new behaviour under the name of a port, and the result could not be compared against the original to judge whether the port is faithful.

*Consequence:* the runtime's idle suspension will correctly stop drawing it once it has been drawn. That is the specified behaviour for a still shader, and this is the first shader to exercise it.

*Deferred deliberately:* animating the balls is a reasonable feature. It belongs to a change that says so.

### Both shaders keep the OKLab blend

The metaball port keeps its source's field-weighted OKLab averaging rather than sharing the mesh gradient's implementation.

*Why:* the two shaders arrived at the same technique independently, and factoring it into a shared GLSL include would create a dependency between two manifests that are supposed to be independent data. Duplicated colour-space maths across manifests is the lesser cost; a shared include is a shell change, which is the thing this contract exists to avoid.

*Revisit when:* a third shader needs it. Three occurrences is when a shared preamble addition earns its place — and it would be an addition to the runtime's contract, proposed as such.

## Risks / Trade-offs

- **A group maximum that disagrees with the GLSL it indexes** → The one way a manifest can validate yet be wrong. Both shaders index a fixed array, so the specification requires the pair to match and each port asserts it.
- **Re-tuning the ribbon's proportions may not reproduce the original exactly** → The default preset is compared against the source experiment as the acceptance test; a visible difference is a defect in the port, not a new look to accept.
- **Duplicated OKLab maths across two manifests** → Accepted knowingly, with a stated threshold for revisiting.
- **A still shader may read as broken** → It is correct, and now covered by the catalogue specification so the next reader finds the reason written down rather than filing a bug.

## Migration Plan

Not applicable. Two shaders are added to the catalogue; nothing existing changes, and no stored document is affected — an object referencing a shader it does not have already has a specified unresolved-fill state.

## Open Questions

None. The three ambiguities this change carried are settled above.
