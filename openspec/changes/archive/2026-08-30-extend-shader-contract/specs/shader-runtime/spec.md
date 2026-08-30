## ADDED Requirements

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
