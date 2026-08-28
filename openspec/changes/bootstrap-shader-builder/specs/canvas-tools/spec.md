## Purpose

Governs direct manipulation on the canvas — which tool is active, how pointer input creates and transforms objects, and how the user navigates the viewport by panning and zooming.

## ADDED Requirements

### Requirement: Exactly one active tool

The canvas SHALL have exactly one active tool at any time, chosen from select, shape, and text. The active tool SHALL be indicated in the toolbar.

#### Scenario: A tool is chosen

- **WHEN** a user chooses a tool
- **THEN** it becomes the active tool, the previous tool becomes inactive, and the toolbar shows which is active

#### Scenario: The application starts

- **WHEN** the canvas is first presented
- **THEN** the select tool is active

#### Scenario: A tool is chosen by keyboard shortcut

- **WHEN** a user presses a tool's keyboard shortcut while focus is not in a text input
- **THEN** that tool becomes active

### Requirement: Select tool

The select tool SHALL let a user select objects by clicking, select multiple objects by dragging a marquee, and move the selection by dragging it.

#### Scenario: An object is clicked

- **WHEN** a user clicks an object with the select tool
- **THEN** the topmost object under the pointer becomes the selection

#### Scenario: Empty canvas is clicked

- **WHEN** a user clicks where no object lies
- **THEN** the selection is cleared

#### Scenario: A marquee is dragged

- **WHEN** a user drags across empty canvas
- **THEN** a marquee is drawn and every unlocked, visible object it encloses is selected on release

#### Scenario: A selection is dragged

- **WHEN** a user drags a selected object
- **THEN** every object in the selection moves by the same offset

#### Scenario: The pointer is over an object

- **WHEN** the pointer rests over a selectable object
- **THEN** the cursor indicates that the object can be selected

### Requirement: Transform handles

A single selected object SHALL present handles for resizing and rotating it.

#### Scenario: A resize handle is dragged

- **WHEN** a user drags a resize handle
- **THEN** the object resizes following the pointer, anchored at the opposite handle

#### Scenario: A resize is constrained

- **WHEN** a user drags a corner handle with the constrain modifier held
- **THEN** the object's aspect ratio is preserved

#### Scenario: A rotate handle is dragged

- **WHEN** a user drags the rotation handle
- **THEN** the object rotates about its center following the pointer

#### Scenario: Several objects are selected

- **WHEN** more than one object is selected
- **THEN** a bounding indicator encloses the whole selection

### Requirement: Shape tool

The shape tool SHALL create a rectangle or ellipse by dragging on the canvas.

#### Scenario: A shape is dragged out

- **WHEN** a user drags on the canvas with the shape tool active
- **THEN** a preview follows the pointer and an object of the chosen shape is created on release

#### Scenario: A shape is created with equal sides

- **WHEN** a user drags with the constrain modifier held
- **THEN** the created shape has equal width and height

#### Scenario: A shape is created

- **WHEN** a shape object is created
- **THEN** it becomes the selection and the tool returns to select

#### Scenario: A drag produces no area

- **WHEN** a drag ends with effectively zero width or height
- **THEN** no object is created

### Requirement: Text tool

The text tool SHALL create a text object where the user clicks and place it directly into editing.

#### Scenario: The canvas is clicked with the text tool

- **WHEN** a user clicks the canvas with the text tool active
- **THEN** a text object is created at that point and enters editing with focus in it

#### Scenario: Text editing is committed

- **WHEN** a user confirms or clicks away while editing text
- **THEN** the typed content is stored on the object, the object becomes the selection, and the tool returns to select

#### Scenario: Text editing is left empty

- **WHEN** a user leaves editing without entering any content
- **THEN** the empty text object is discarded

#### Scenario: An existing text object is opened for editing

- **WHEN** a user double-clicks an existing text object with the select tool
- **THEN** it enters editing with its current content selected

### Requirement: Viewport pan and zoom

The canvas SHALL support panning and zooming the viewport independently of the objects it contains.

#### Scenario: The viewport is zoomed

- **WHEN** a user zooms
- **THEN** the scene scales about the pointer position, and the current zoom level is displayed

#### Scenario: The viewport is panned

- **WHEN** a user pans with the designated input
- **THEN** the scene translates without changing any object's stored position

#### Scenario: Zoom reaches a limit

- **WHEN** zooming would pass the minimum or maximum zoom level
- **THEN** the zoom clamps at that limit

#### Scenario: The view is reset to fit

- **WHEN** a user invokes zoom-to-fit
- **THEN** the viewport is positioned and scaled so all visible objects are in view

### Requirement: Hit-testing respects object state

Pointer targeting SHALL respect each object's stacking order, visibility, and locked state.

#### Scenario: Objects overlap under the pointer

- **WHEN** several objects lie under the pointer
- **THEN** the one drawn on top is targeted

#### Scenario: A hidden object lies under the pointer

- **WHEN** a hidden object lies under the pointer
- **THEN** it is not targeted, and targeting falls through to what is beneath it

#### Scenario: An object is rotated

- **WHEN** a rotated object is targeted
- **THEN** hit-testing accounts for its rotation rather than testing its unrotated bounds

### Requirement: Keyboard manipulation

Selected objects SHALL be movable and deletable from the keyboard.

#### Scenario: An arrow key is pressed with a selection

- **WHEN** a user presses an arrow key while objects are selected and focus is not in a text input
- **THEN** the selection moves by one step in that direction

#### Scenario: An arrow key is pressed with the coarse modifier

- **WHEN** a user presses an arrow key with the coarse-movement modifier held
- **THEN** the selection moves by a larger step

#### Scenario: Delete is pressed with a selection

- **WHEN** a user presses the delete key while objects are selected and focus is not in a text input
- **THEN** the selected objects are removed, as a single undoable step
