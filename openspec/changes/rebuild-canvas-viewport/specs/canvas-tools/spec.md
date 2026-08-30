## MODIFIED Requirements

### Requirement: Viewport pan and zoom

The canvas SHALL support panning and zooming the viewport independently of the objects it contains. Every layer the canvas draws — its objects, their selection indicators, and any editor over them — SHALL be positioned by the same viewport, so that one view of the canvas is shown rather than several disagreeing ones.

#### Scenario: The viewport is zoomed

- **WHEN** a user zooms
- **THEN** the scene scales about the pointer position, and the current zoom level is displayed

#### Scenario: The viewport is panned

- **WHEN** a user pans with the designated input
- **THEN** the scene translates without changing any object's stored position

#### Scenario: An object is viewed at a moved viewport

- **WHEN** the viewport is panned or zoomed with an object selected
- **THEN** the object, its selection indicator, and its handles occupy the same region of the screen as one another

#### Scenario: Zoom reaches a limit

- **WHEN** zooming would pass the minimum or maximum zoom level
- **THEN** the zoom clamps at that limit

#### Scenario: The view is reset to fit

- **WHEN** a user invokes zoom-to-fit
- **THEN** the viewport is positioned and scaled so all visible objects are in view

#### Scenario: The view is framed on the selection

- **WHEN** a user invokes zoom-to-selection with objects selected
- **THEN** the viewport is positioned and scaled so those objects are in view, whatever else the document contains

#### Scenario: Zoom-to-selection is invoked with nothing selected

- **WHEN** a user invokes zoom-to-selection and nothing is selected
- **THEN** the viewport is unchanged

## ADDED Requirements

### Requirement: Panning is available without leaving the active tool

The canvas SHALL let a user pan by holding a modifier and dragging, whatever tool is active, and SHALL restore the active tool's behaviour when the modifier is released.

#### Scenario: A user pans while a drawing tool is active

- **WHEN** a user holds the pan modifier and drags with a drawing tool active
- **THEN** the view pans and nothing is drawn

#### Scenario: The modifier is released

- **WHEN** the pan modifier is released
- **THEN** the active tool resumes, with no partial gesture left behind from the pan

#### Scenario: The pointer indicates what a drag will do

- **WHEN** the pan modifier is held
- **THEN** the pointer indicates that dragging will pan rather than draw or select

### Requirement: An unbounded canvas shows where the view is

The canvas SHALL draw a regular ground that follows the viewport, so that panning across a region containing no objects is visible as movement. The ground SHALL scale with magnification, and SHALL remain legible rather than becoming dense or sparse without bound.

#### Scenario: The view is panned across emptiness

- **WHEN** a user pans across a region with no objects in it
- **THEN** the ground moves with the view, so the pan is visible

#### Scenario: The view is magnified

- **WHEN** the view is magnified or reduced
- **THEN** the ground scales with it, and its spacing stays within a legible range rather than collapsing into a solid field or vanishing

#### Scenario: The ground sits behind the work

- **WHEN** objects are drawn over the ground
- **THEN** the ground is behind all of them, and never appears over an object or its selection indicator
