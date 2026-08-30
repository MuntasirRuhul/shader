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
