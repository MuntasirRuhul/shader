## Why

The canvas already pans and zooms. What it draws does not.

Every overlay — the selection box, its handles, the text editor — is positioned through the viewport. The shader layer is not: the scene hands the renderer each object's stored coordinates, and the model matrix maps those straight to clip space against the canvas element's CSS size. Pan never reaches the renderer at all, and zoom reaches it only to choose a text mask's resolution. At 100% with no pan the two agree, which is why this went unnoticed. Pan or zoom and the artwork separates from the box that claims to contain it, by exactly the pan and exactly the zoom.

`canvas-tools` already requires that zooming scales "the scene". It does not. This is a defect against a published requirement, and it makes the existing infinite canvas unusable the moment anyone moves the view — which is the first thing anyone does.

Two further changes are planned on top of this one — frames as nesting containers, and a rebuilt toolbar with a typography panel — and both are built on the canvas being trustworthy. This goes first.

## What Changes

- **The runtime renders through a viewport.** The renderer is given a pan and a zoom and places objects accordingly, so what is drawn and what is overlaid agree at any view. Objects keep storing canvas coordinates; the view stays a property of looking, not of what is looked at.
- **Precision is held near the viewer, not near the origin.** Placement is computed relative to the view before it is narrowed to the single-precision matrix the program reads, so an object far from the origin at high magnification stays where it is put instead of jittering.
- **An unbounded surface becomes legible.** A grid that scales with the view, so panning across emptiness reads as movement rather than as nothing happening.
- **Panning and framing match what the canvas already claims.** Holding space pans with any tool active, which the code comments already promise and the code does not do. Zoom-to-selection is separated from zoom-to-fit, rather than one shortcut guessing between them.
- **What a shader is told about its object does not change with the view.** `uResolution` stays the object's size in canvas pixels, so magnifying an object magnifies its artwork rather than re-rendering it at a different scale. Zooming inspects the work; it does not alter it.

Not in scope, each planned separately: frames as freely-nesting clipping containers, the frame tool, and applying a shader to the selection; and the floating toolbar and typography panel drawn from the `general builder.html` reference. The reference has no infinite canvas of its own — it is a fixed stage with hidden overflow and fractional coordinates — so nothing about the viewport comes from it.

## Capabilities

### New Capabilities

None. The canvas already claims this behaviour; it does not deliver it.

### Modified Capabilities

- `shader-runtime`: rendering gains a viewport. What the runtime places an object against becomes the view rather than the drawing surface, and the precision with which it does so becomes a stated requirement rather than an accident of where the origin happens to be.
- `canvas-tools`: the pan-and-zoom requirement is strengthened to cover what is drawn, not only what is overlaid — the gap this change exists to close. Panning by holding space, zoom-to-selection as distinct from zoom-to-fit, and a view-scaled grid join it.

## Impact

- **Shader core**: the model matrix and the render item's transform, and the surface sizing that feeds them. The uniform binding, the parameter schema, and the simulation contract are untouched.
- **Application**: the canvas hook passes the viewport rather than a bare zoom; the stage gains a grid; the pointer and shortcut handlers gain space-drag and zoom-to-selection. No panel, inspector, or document change — an object's stored coordinates mean exactly what they meant before.
- **Existing shaders**: unaffected. A shader addresses its object through `vUv`, which is why the view can change underneath it without any shader knowing.
- **Documents**: unaffected. The viewport was never persisted and still is not; reopening a document restores its objects, not the view someone last had of them.
- **Risk**: the grid is drawn every frame across the whole surface. Drawn in the shader layer it costs a full-surface pass on a canvas that may otherwise be idle; drawn in CSS it costs nothing but cannot sit between objects. The choice is a design decision, not an implementation detail, and is made explicitly.
- **Risk**: single precision is a ceiling, not a bug to be fixed once. Holding placement relative to the view moves the ceiling far enough out that no plausible document reaches it, and the limit is stated rather than left to be discovered.
