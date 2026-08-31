## Purpose

Renders registered shaders to the canvas — compiling and caching their programs, feeding parameter values into them, driving a single animation loop for the whole scene, and recovering when the graphics context is lost.

## Requirements

### Requirement: Program compilation

The runtime SHALL compile a shader's program from its manifest sources before first use and SHALL report compilation failures with the shader's identity and the diagnostic produced by the graphics driver.

#### Scenario: A shader is used for the first time

- **WHEN** a shader is rendered for the first time
- **THEN** its program is compiled and linked
- **AND** rendering proceeds once compilation succeeds

#### Scenario: A shader fails to compile

- **WHEN** a shader's source fails to compile or link
- **THEN** the failure is reported with the shader's identifier and the driver's diagnostic message
- **AND** the application remains usable, with the affected object showing an error state instead of the shader

### Requirement: Program caching

The runtime SHALL compile each distinct shader program at most once per graphics context and SHALL reuse it for every object that references that shader.

#### Scenario: Several objects use one shader

- **WHEN** multiple objects on the canvas use the same shader
- **THEN** the program is compiled once and shared

#### Scenario: A shader is reselected

- **WHEN** a shader is deselected and later selected again within the same session
- **THEN** the cached program is reused rather than recompiled

### Requirement: Parameter values drive uniforms

The runtime SHALL bind parameter values to the shader program according to the manifest's parameter schema, without shader-specific binding code.

#### Scenario: A parameter value changes

- **WHEN** a parameter's value changes
- **THEN** the next rendered frame reflects the new value

#### Scenario: A repeatable group changes size

- **WHEN** entries are added to or removed from a repeatable group
- **THEN** the rendered result reflects the new entry count without recompiling the program

#### Scenario: A parameter has no explicit value

- **WHEN** an object does not specify a value for one of its shader's parameters
- **THEN** the parameter's declared default is bound

### Requirement: Passes render in order through intermediate targets

The runtime SHALL render a shader's passes in declared order, giving each pass that others read its own target, and drawing only the final pass to the object.

#### Scenario: A shader with several passes is drawn

- **WHEN** an object using a multi-pass shader is drawn
- **THEN** each pass runs in declared order
- **AND** only the last pass's output appears on the canvas

#### Scenario: A pass reads an earlier pass

- **WHEN** a pass reads the output of a pass before it
- **THEN** it reads what that pass produced in the current frame

#### Scenario: A pass reads its own previous frame

- **WHEN** a pass reads what it wrote on the previous frame
- **THEN** it receives the previous frame's output, and the current frame's output is kept for the next
- **AND** on the very first frame it receives a cleared target rather than undefined contents

#### Scenario: The object is resized

- **WHEN** an object using a multi-pass shader changes size
- **THEN** the intermediate targets follow, and what a pass reads stays aligned with what is drawn

#### Scenario: A pass is drawn into while it is still readable

- **WHEN** a pass draws into a target that a sampler unit still holds
- **THEN** this SHALL NOT happen: the runtime releases what a pass sampled once it has drawn, and leaves a newly allocated target bound to nothing

The graphics interface treats a texture that is both read and written by one
draw as a feedback loop and discards the draw entirely, without an error the
shader author ever sees — the pass appears to run and its target keeps whatever
it was cleared to.

### Requirement: A pass declares what its target must hold

The runtime SHALL let a pass declare the precision of its target, the fraction
of the object it runs at, and how many times it runs per frame, and SHALL
default each to the plainest choice — eight bits a channel, the object's full
size, and once — so a pass that draws a picture costs no more than it did
before any of this existed.

#### Scenario: A pass holds a field rather than a colour

- **WHEN** a pass declares float precision
- **THEN** its target holds signed sixteen-bit channels, so a velocity, a pressure, or a colour brighter than white survives being written

#### Scenario: The driver cannot draw into a float target

- **WHEN** the graphics driver does not offer rendering into float targets
- **THEN** the pass falls back to eight bits and still draws, because a shader that looks poor is better than a canvas that is blank

#### Scenario: A solve runs coarser than what is shown

- **WHEN** a pass declares a scale below one
- **THEN** its target is that fraction of the object's size, and later passes sampling it are unaffected by its resolution

#### Scenario: A pass repeats until its field relaxes

- **WHEN** a pass declares several iterations and reads what it last wrote
- **THEN** it runs that many times per frame, each run reading the previous run's output
- **AND** each run is told which iteration it is, since a solve often begins differently from how it continues

#### Scenario: A pass repeats but cannot see what it last wrote

- **WHEN** a pass declares more than one iteration without reading itself
- **THEN** registration fails: every run after the first would repeat the first, at the full cost of a draw

### Requirement: A shader is bound the pictures it declares

The runtime SHALL bind a texture for each picture parameter a shader declares,
under a sampler of that parameter's name, together with whether a picture is
bound at all and the picture's own pixel dimensions.

#### Scenario: A picture has been chosen

- **WHEN** an object's shader declares a picture parameter and its picture has decoded
- **THEN** the picture is bound for every pass the shader draws through
- **AND** the shader is told its dimensions, so it can fit it to an object of another shape

#### Scenario: No picture has been chosen, or it is still decoding

- **WHEN** a picture parameter has no value, or its file has not finished decoding
- **THEN** the shader is told no picture is bound, rather than being left sampling whatever the unit last held

### Requirement: Single shared render loop

The runtime SHALL drive all animated shaders from one animation loop synchronized to the display refresh.

#### Scenario: Multiple animated objects are on the canvas

- **WHEN** several objects with animated shaders are visible
- **THEN** they are all advanced and drawn within the same frame, from a single loop

#### Scenario: Nothing needs to animate

- **WHEN** no visible object requires animation and no parameter is changing
- **THEN** the runtime stops requesting frames until something changes

#### Scenario: The document is hidden

- **WHEN** the browser tab or window becomes hidden
- **THEN** the runtime suspends rendering
- **AND** resumes when the document becomes visible again, without a time discontinuity that visibly jumps the animation

### Requirement: Time is supplied consistently

The runtime SHALL supply each animated shader with an elapsed-time value that advances continuously while rendering is active and does not depend on the frame rate achieved.

#### Scenario: Frame rate varies

- **WHEN** the achieved frame rate fluctuates
- **THEN** animation speed remains consistent in wall-clock terms

#### Scenario: Rendering resumes after suspension

- **WHEN** rendering resumes after being suspended
- **THEN** elapsed time continues from where it was suspended rather than jumping forward by the suspended duration

### Requirement: Rendering matches display resolution

The runtime SHALL render at the display's device pixel ratio, bounded by a configured maximum, and SHALL respond to size changes of its drawing surface.

#### Scenario: The canvas is resized

- **WHEN** the canvas drawing surface changes size
- **THEN** the rendered output matches the new size without stretching or blurring

#### Scenario: The display has a high device pixel ratio

- **WHEN** the application runs on a display whose device pixel ratio exceeds the configured maximum
- **THEN** rendering is capped at that maximum rather than scaling without bound

### Requirement: Graphics context loss recovery

The runtime SHALL detect loss of the graphics context, prevent the default browser handling, and restore rendering when the context is restored.

#### Scenario: The graphics context is lost

- **WHEN** the graphics context is lost
- **THEN** the runtime stops issuing draw calls and does not raise unhandled errors
- **AND** the user is informed that rendering is temporarily unavailable

#### Scenario: The graphics context is restored

- **WHEN** the graphics context is restored
- **THEN** programs and resources are recreated and rendering resumes
- **AND** the scene and all parameter values are unchanged from before the loss

### Requirement: Resource release

The runtime SHALL release graphics resources belonging to shaders and objects that are no longer present.

#### Scenario: An object is deleted

- **WHEN** an object using a shader is deleted and no other object uses that shader
- **THEN** the resources held for it are released

#### Scenario: The application is torn down

- **WHEN** the rendering surface is unmounted
- **THEN** the animation loop stops and all held graphics resources are released

### Requirement: Intermediate targets are released

The runtime SHALL release the targets belonging to objects and shaders that are no longer being drawn, as it does for programs.

#### Scenario: An object using a multi-pass shader is deleted

- **WHEN** such an object is deleted
- **THEN** the targets held for it are released

#### Scenario: The rendering surface is torn down

- **WHEN** the surface is unmounted
- **THEN** every intermediate target is released along with the programs

#### Scenario: A shader stops being multi-pass

- **WHEN** an object's fill changes to a shader needing fewer targets
- **THEN** the targets no longer needed are released rather than retained
