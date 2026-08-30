## Context

See `proposal.md` — Why. The short version is that the viewport reaches every layer except the one that draws the work.

Four things constrain the approach.

The model matrix is already the single place canvas coordinates become clip space, and it already runs in JavaScript double precision before narrowing to the single-precision matrix the vertex stage reads. That narrowing point is where a precision decision has to be made, and it is the only such point.

`vUv` means a shader addresses its own object and knows nothing about where that object sits. Nothing added here may disturb that, or the coupling the shader contract exists to remove comes straight back.

The canvas element is transparent and composites over whatever is behind it. That makes a ground plane a question of what to put underneath, not of what to draw.

Panning and zooming happen at pointer cadence — dozens of events a second — while the document changes rarely. Anything that treats a view change as a document change pays for it on every wheel tick.

## Goals / Non-Goals

**Goals:**

- One view of the canvas, drawn by every layer from the same numbers.
- Placement accuracy that follows distance from the viewer, not distance from the origin.
- A view change costs a redraw, never a document rebuild.

**Non-Goals:**

- Culling objects outside the view. Worth doing when a document is large enough to need it; today the scene is small and the check would cost more than it saves.
- Rendering the ground in the shader layer. Rejected below.
- Any change to how a document stores coordinates, or to what a shader is told. An object means the same thing it meant before.

## Decisions

### The runtime is given a viewport; it does not infer one

The rendering port gains a viewport — a magnification and a translation — alongside the scene, defaulting to the identity view.

*Why not transform the scene instead:* the studio could pre-multiply each object's transform when it builds the scene, leaving the runtime untouched. But the runtime also reports each object's size to its shader, and that size must stay in canvas coordinates while the placement does not. Baking the view into the transform would fuse two things that have to move independently, and the runtime would have no way to tell them apart again.

*Why not transform the canvas element in CSS:* a scaled canvas is a resampled canvas — the work would blur at any magnification above one, and the drawing buffer would no longer cover what is on screen. The whole point of a shader canvas is that magnifying re-evaluates the shader rather than stretching its output.

*Why separate from the scene rather than part of it:* a view change would otherwise be a scene change, rebuilding the item list and re-examining held resources on every frame of a pan. They are set by the same caller and neither depends on the other, so there is no ordering hazard in keeping them apart.

*Consequence, and why it is the migration:* a caller that supplies no viewport gets the identity view, which is exactly today's behaviour. Every existing test of the runtime keeps passing without being touched, which is what makes it safe to change the thing that draws everything.

### The view is applied in double precision, on the processor, before the matrix is narrowed

Pan and zoom fold into the matrix computation where it still runs in double precision, rather than being handed to the vertex stage as a separate single-precision transform.

*Why:* this is the whole of the precision problem. An object at canvas coordinate 10⁶ viewed at high magnification produces enormous intermediates and a small final clip-space value. Done in double precision the large terms cancel before anything is narrowed, and the single-precision matrix only ever holds the small result. Done on the graphics side, the cancellation happens in single precision and the object jitters by a fraction of its own coordinate — visibly, and worse the further out you work.

*What it costs:* the matrix must be recomputed when the view changes, not only when an object does. It is a handful of arithmetic per object per frame, which is nothing next to a fragment shader.

*Where the ceiling actually is:* double precision holds this far past any document a person will build. The limit is stated so it is known rather than discovered.

*What investigation ruled out:* magnification does not cost sharpness. The drawing buffer already tracks the display's own resolution and a fragment shader is evaluated per screen pixel, so a magnified object is re-rendered rather than enlarged. Text masks are already rasterized against the current magnification. The far-from-origin risk was numeric all along, and that is what is addressed here — no change to how the surface is sized is needed, and none is made.

### The ground is drawn beneath the canvas, not inside it

A tiled ground positioned and scaled from the viewport, behind the transparent canvas element.

*Why not in the shader layer:* it would be a full-surface pass every frame, on a canvas whose entire idle strategy is to stop drawing when nothing moves. A still document would either keep rendering to maintain its own background, or stop and have the background stop with it. Beneath the canvas it costs nothing, survives the loop idling, and is behind every object by construction rather than by remembering to draw it first.

*Why not a fixed spacing:* a ground that scales with magnification without bound becomes a solid field when zoomed out and a single line when zoomed in. Spacing therefore steps by a fixed factor as magnification crosses thresholds, so the ground always reads at a legible density and the steps land on round multiples of the canvas grid rather than at arbitrary sizes.

*The trade-off accepted:* the ground cannot sit between objects, only behind all of them. Nothing wants that, and it is what the spec asks for.

### Panning by holding space joins the inputs that already exist

Space becomes a pan modifier alongside the middle button and the existing modifier.

*Why:* the pointer handler's own comment already promises it. More usefully, it is the one pan gesture available while a drawing tool is active and both other options are taken — the middle button is not on every device, and the modifier already means something to some tools.

*What it has to be careful about:* space is a character. While text is being edited it must type a space and nothing else; it must not scroll the page or press a focused control; and releasing it mid-drag must end the pan without leaving a half-finished gesture for the tool underneath to inherit.

### Zoom-to-fit and zoom-to-selection stop being one gesture

Two commands: one frames everything visible, one frames the selection and does nothing when there is none.

*Why:* today one shortcut looks at the selection and decides for you, so the same key does two different things depending on state you may not be tracking. Framing everything is how you find your work; framing the selection is how you inspect it. Wanting one while the other happens is the common case, and it is unfixable while they share a key.

## Risks / Trade-offs

- **Everything drawn goes through the changed path, so an error here is visible everywhere** → The identity viewport is exactly today's behaviour, so the existing runtime tests keep their meaning untouched and any deviation shows up as a failure in them rather than as something noticed by eye later.
- **A view change now redraws** → It already had to; only the overlays were getting it. The redraw is one frame per view change, which is the cadence the canvas already runs at while anything animates.
- **The ground is CSS and the work is WebGL, so two rendering systems must agree on one view** → They agree because they are given the same numbers from the same place. The scenario that proves it is an object and its selection indicator landing on the same pixels, which fails loudly if they ever diverge.
- **Space-drag can steal a keystroke** → It is scoped to the canvas surface with text editing excluded, and released cleanly. The failure mode to watch is a space typed into a text object panning the canvas instead, which is a stated scenario rather than something to find later.

## Migration Plan

Nothing to migrate. Objects store what they always stored, documents are unchanged, and a runtime given no viewport behaves exactly as it does now. The application starts supplying one, and the canvas becomes correct.

## Open Questions

None.
