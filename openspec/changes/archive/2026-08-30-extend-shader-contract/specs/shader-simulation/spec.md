## Purpose

Lets a shader own state that changes between frames — drifting positions, an ageing trail, anything whose next value depends on its last — so that motion the shader program cannot express on its own becomes part of what a shader is.

## ADDED Requirements

### Requirement: A shader may declare simulation state

A manifest MAY declare an initial state and a function that advances it. A manifest that declares neither SHALL behave exactly as one that cannot.

#### Scenario: A shader declares state

- **WHEN** a manifest declares an initial state and an advance function
- **THEN** the registry accepts it
- **AND** objects using that shader each hold their own copy of the state

#### Scenario: A shader declares no state

- **WHEN** a manifest declares neither
- **THEN** it renders exactly as it did before simulation existed, with no advance step

#### Scenario: A manifest declares state without a way to advance it

- **WHEN** a manifest declares an initial state but no advance function, or the reverse
- **THEN** registration fails, naming the shader and the missing half

### Requirement: State advances once per frame

The runtime SHALL advance a shader's state once per rendered frame, before drawing, passing the time elapsed since the previous advance, the object's current parameter values, and the pointer's position over the object.

#### Scenario: A frame is rendered

- **WHEN** a frame is drawn for an object whose shader declares state
- **THEN** the state is advanced exactly once, before that object is drawn

#### Scenario: The frame rate varies

- **WHEN** the achieved frame rate fluctuates
- **THEN** the elapsed time passed to the advance reflects real time, so the simulation runs at a consistent speed rather than a consistent step count

#### Scenario: Rendering is suspended and resumes

- **WHEN** rendering suspends and later resumes
- **THEN** the first advance afterwards receives the time actually spent rendering, not the time spent suspended

#### Scenario: Several objects share a shader

- **WHEN** several objects use the same shader with state
- **THEN** each object's state advances independently, and one object's state never affects another's

### Requirement: An advance is a pure function of what it is given

An advance SHALL depend only on the previous state, the elapsed time, the parameter values, and the pointer input it receives, and SHALL NOT reach the document, the canvas, or any browser interface.

#### Scenario: The same inputs are supplied twice

- **WHEN** an advance is given the same previous state, elapsed time, parameters, and pointer input
- **THEN** it produces the same next state

#### Scenario: An advance is exercised without a browser

- **WHEN** an advance is called directly, outside any rendering
- **THEN** it runs and returns a next state, so a shader's motion is testable without a canvas

### Requirement: State reaches the program as values it can read

The values an advance produces SHALL be bound to the shader program by the same rules that bind parameter values, so a shader reads its state exactly as it reads a parameter.

#### Scenario: A state value is bound

- **WHEN** an advance returns a value the program declares
- **THEN** the next frame draws with that value

#### Scenario: State and a parameter share a name

- **WHEN** a manifest declares a state value and a parameter with the same name
- **THEN** registration fails, naming the shader and the collision

### Requirement: Pointer input is expressed in the object's own space

An advance SHALL receive the pointer's position in the object's coordinates, and SHALL be told whether the pointer is over the object at all.

#### Scenario: The pointer is over the object

- **WHEN** the pointer is over an object whose shader declares state
- **THEN** the advance receives its position in that object's coordinates, and that the pointer is present

#### Scenario: The pointer is elsewhere

- **WHEN** the pointer is outside the object, or has left the canvas
- **THEN** the advance is told the pointer is absent, and the simulation continues without it

#### Scenario: The object is moved or rotated

- **WHEN** an object is moved, resized, or rotated
- **THEN** the pointer position the advance receives is expressed in the object's new frame, so a shader reacting to the pointer needs no knowledge of the object's placement

### Requirement: A failing advance does not take the canvas down

An advance that throws or overruns SHALL be reported and stopped for that object, and the rest of the canvas SHALL continue rendering.

#### Scenario: An advance throws

- **WHEN** a shader's advance throws
- **THEN** the failure is reported with the shader's identity
- **AND** that object stops advancing while every other object continues to render

#### Scenario: An advance is too slow

- **WHEN** an advance consistently takes longer than the frame budget allows
- **THEN** the runtime reports it against that shader rather than letting the canvas quietly stutter
