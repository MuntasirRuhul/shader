## 1. Declare simulation state

- [x] 1.1 Extend the manifest type so a shader may declare an initial state and an advance function, both optional together; verify a manifest declaring one without the other fails validation naming the missing half
- [x] 1.2 Reject a state value whose name collides with a parameter; verify the error names the shader and the collision
- [x] 1.3 Define what an advance receives — previous state, elapsed seconds, resolved parameter values, and pointer input — as a type that carries nothing from the document or the browser; verify an advance can be called directly in a test with no canvas
- [x] 1.4 Verify a manifest declaring no state validates and is unchanged in every respect

## 2. Advance state each frame

- [x] 2.1 Hold state per object rather than per shader; verify two objects using one shader advance independently and neither sees the other's values
- [x] 2.2 Advance every object's state once per frame, before drawing; verify the order and that exactly one advance happens per frame per object
- [x] 2.3 Pass real elapsed seconds, so the simulation runs at a consistent speed under a varying frame rate; verify against simulated frame-rate variation
- [x] 2.4 Verify an advance after a suspension receives the time spent rendering rather than the time spent suspended
- [x] 2.5 Bind the values an advance returns through the existing uniform binding, including repeatable-group packing; verify a returned array reaches the program exactly as a parameter array does
- [x] 2.6 Verify an object whose shader declares no state costs no advance step

## 3. Pointer input

- [x] 3.1 Supply the pointer to an advance in the object's own coordinates, with whether it is over the object; verify the position is correct for a moved, resized, and rotated object
- [x] 3.2 Report the pointer as absent when it leaves the object or the canvas; verify the advance is not given a stale position

## 4. Contain a failing advance

- [x] 4.1 Report an advance that throws, with the shader's identity, and stop advancing that object while the rest of the canvas keeps rendering; verify both
- [x] 4.2 Measure advance duration and report a shader that consistently overruns the frame budget; verify it is reported against the shader rather than surfacing as an unexplained stutter

## 5. Rendering passes

- [x] 5.1 Extend the manifest so a shader may declare passes in order, each with its own program and what it reads; verify a manifest declaring none renders exactly as before
- [x] 5.2 Reject a pass that reads a later pass, naming the shader and both passes; verify a pass reading an earlier one is accepted
- [x] 5.3 Render passes in order through intermediate targets, drawing only the last to the object; verify each pass runs once and only the final output appears
- [x] 5.4 Give a pass that reads an earlier pass that pass's current-frame output; verify it
- [x] 5.5 Implement a pass reading what it wrote on the previous frame, swapping targets between frames; verify it receives the previous frame's output and that the first frame receives a cleared target rather than undefined contents
- [x] 5.6 Resize intermediate targets with the object; verify what a pass reads stays aligned with what is drawn
- [x] 5.7 Release intermediate targets when an object is deleted, when a fill changes to need fewer, and on teardown; verify none remain allocated in each case

## 6. Re-port the metaball

- [x] 6.1 Port the metaball's simulation — wandering heading, mutual attraction, cursor repulsion, damping, speed clamp, spawn easing — as an advance function; verify it runs headlessly and that balls drift, attract under magnet, and flee the pointer
- [x] 6.2 Author the metaball's real parameter schema — Count, Size, Blur, Magnet, Speed, a colour palette, and the background — matching the controls the experiment has; verify no per-ball editing remains and that the schema passes validation
- [x] 6.3 Rewrite the metaball manifest to draw from state rather than from authored positions; verify the GLSL reads the state values and declares no count parameter of its own
- [x] 6.4 Author presets over the real controls; verify each resolves to a complete value set
- [x] 6.5 Verify in the browser that the metaball moves, that Magnet pulls the balls together, that Speed changes the rate, and that the cursor pushes them away — matching the source experiment

## 7. Verify the whole

- [ ] 7.1 Verify every existing shader is unchanged in behaviour, since none declares state or passes
- [ ] 7.2 Verify a shader declaring both state and passes works, so the two features compose rather than merely coexisting
- [ ] 7.3 Verify a document reopened after a reload starts from the declared initial state, and that this is what the specification requires rather than a defect
- [ ] 7.4 Verify the full root script set passes on a clean checkout, and update the README's shader contract section to describe state, passes, and pointer input
