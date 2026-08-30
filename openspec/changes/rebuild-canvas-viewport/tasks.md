## 1. Draw through a viewport

- [x] 1.1 Give the rendering port a viewport — a magnification and a translation — separate from the scene, defaulting to the identity view; verify a runtime given none draws exactly as it does today, by the existing runtime tests passing untouched
- [x] 1.2 Fold the viewport into the model matrix where it still runs in double precision; verify an object's drawn corners against hand-computed clip-space positions at a translated view, a magnified view, and both together
- [x] 1.3 Verify the view composes correctly with an object's own transform: a moved, resized, and rotated object lands where the same transform predicts at a magnified and translated view
- [x] 1.4 Verify a view change costs a redraw and not a scene rebuild, so panning does not re-examine the resources held for every object
- [x] 1.5 Verify the size reported to a shader stays the object's canvas size at every magnification, so magnifying enlarges what a shader drew rather than making it draw something else
- [x] 1.6 Verify the pointer an object's shader receives is still in that object's own coordinates at a moved view, and is reported absent when the pointer is outside the object

## 2. Hold precision near the viewer

- [x] 2.1 Verify an object a million canvas units from the origin, viewed at high magnification, lands within a fraction of a pixel of where it should, and that the same object near the origin is no more accurate
- [x] 2.2 Verify the drawn position holds still across frames while the view holds still, so a distant object does not jitter
- [x] 2.3 Verify a smooth pan through a distant region produces smoothly changing positions, with no step larger than the pan itself

## 3. Supply the viewport from the application

- [ ] 3.1 Pass the viewport from the editor's state to the renderer, replacing the bare magnification the canvas hook takes today; verify a pan and a zoom both reach the renderer
- [ ] 3.2 Verify an object's drawn region and its selection indicator coincide at a panned view, at a magnified view, and at both — the defect this change exists to close
- [ ] 3.3 Verify the same for a text object and its editor, which is positioned by the viewport independently

## 4. Ground the canvas

- [ ] 4.1 Draw a tiled ground beneath the transparent canvas, positioned and scaled from the viewport; verify panning across an empty region visibly moves it
- [ ] 4.2 Step the ground's spacing by a fixed factor as magnification crosses thresholds; verify the spacing stays within a legible range across the full zoom range rather than collapsing or vanishing
- [ ] 4.3 Verify the ground sits behind every object and every selection indicator, and that it costs nothing while the render loop is idle

## 5. Pan and frame

- [ ] 5.1 Make holding space pan with any tool active; verify the view pans, nothing is drawn or selected, and the pointer indicates what a drag will do
- [ ] 5.2 Verify releasing space mid-drag ends the pan cleanly, leaving no partial gesture for the active tool to inherit
- [ ] 5.3 Verify space types a space while text is being edited, and neither pans nor scrolls the page nor presses a focused control
- [ ] 5.4 Separate zoom-to-selection from zoom-to-fit as two commands; verify zoom-to-fit frames every visible object whatever is selected, zoom-to-selection frames only the selection, and zoom-to-selection with nothing selected leaves the view alone

## 6. Verify the whole

- [ ] 6.1 Verify every shipped shader is unchanged in appearance at the identity view, since none of them knows the view exists
- [ ] 6.2 Verify an animated shader and a shader owning state both keep running correctly while the view is panned and magnified, with the simulation stepping by real time throughout
- [ ] 6.3 Verify in the browser that an object stays under its selection box through a pan, a zoom, and a rotation, and that a shader-filled object magnifies sharply rather than blurring
- [ ] 6.4 Verify the full root script set passes on a clean checkout, and update the README's canvas section to describe panning, framing, and the ground
