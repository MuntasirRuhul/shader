## Purpose

Turns a shader's declared parameter schema into the inspector's editing controls, so every shader gets a complete, correctly typed panel without shipping any interface code of its own.

## ADDED Requirements

### Requirement: Controls are generated from the parameter schema

The inspector SHALL render controls for the selected object's shader by reading its parameter schema. It SHALL NOT contain shader-specific control code.

#### Scenario: An object with a shader fill is selected

- **WHEN** an object whose fill is a shader is selected
- **THEN** the inspector shows a control for every parameter in that shader's schema
- **AND** each control shows the object's current value for that parameter

#### Scenario: A newly registered shader is selected

- **WHEN** a shader registered after the inspector was written is selected
- **THEN** its controls render correctly with no change to inspector code

#### Scenario: Selection changes to a different shader

- **WHEN** the selection changes to an object using a different shader
- **THEN** the panel is rebuilt for the new shader's schema, showing that object's values

### Requirement: Control type matches parameter type

Each parameter type SHALL render as the control appropriate to it: numeric parameters as a slider with a numeric entry, boolean parameters as a toggle, color parameters as a color picker with a text entry, enumerated parameters as a chooser over the declared options, and vector parameters as paired numeric entries.

#### Scenario: A numeric parameter is rendered

- **WHEN** a numeric parameter is rendered
- **THEN** its control honors the declared minimum, maximum, and step
- **AND** the current value is displayed numerically alongside the slider

#### Scenario: An enumerated parameter is rendered

- **WHEN** an enumerated parameter is rendered
- **THEN** exactly the declared options are offered, labeled as declared

#### Scenario: A value is typed outside the allowed range

- **WHEN** a user types a numeric value outside the declared range
- **THEN** the value is clamped to the range and the control shows the clamped value

#### Scenario: A value is typed that cannot be parsed

- **WHEN** a user types a value that cannot be interpreted for the parameter's type
- **THEN** the control reverts to the last valid value and the document is not modified

### Requirement: Repeatable groups

Repeatable parameter groups SHALL let the user add, remove, and reorder entries, each with its own controls, up to the declared maximum.

#### Scenario: An entry is added

- **WHEN** a user adds an entry to a repeatable group below its maximum
- **THEN** a new entry appears with its parameters at their defaults, and the rendered result updates

#### Scenario: The maximum is reached

- **WHEN** a repeatable group holds its maximum number of entries
- **THEN** the control to add another is unavailable and explains why

#### Scenario: An entry is removed

- **WHEN** a user removes an entry
- **THEN** it disappears from the list, the remaining entries keep their values, and the rendered result updates

#### Scenario: Entries are reordered

- **WHEN** a user reorders entries
- **THEN** the new order is stored and reflected in the rendered result

### Requirement: Edits apply live

Changing a control SHALL update the rendered canvas without an explicit apply action.

#### Scenario: A slider is dragged

- **WHEN** a user drags a slider
- **THEN** the canvas updates continuously during the drag

#### Scenario: A control is edited

- **WHEN** any control's value changes
- **THEN** the change is written to the selected object's parameter values and becomes part of the document

### Requirement: Grouping and disclosure

Parameters SHALL be presented under the group headings declared in the schema, and groups SHALL be collapsible. Collapse state SHALL persist per shader across sessions.

#### Scenario: Grouped parameters are displayed

- **WHEN** a shader's parameters declare groups
- **THEN** the panel presents them under those headings, in the declared order

#### Scenario: A group is collapsed and the shader is revisited

- **WHEN** a user collapses a group, then later selects that shader again
- **THEN** the group is still collapsed

### Requirement: Reset to default

The inspector SHALL let a user reset an individual parameter, or all of a shader's parameters, to their declared defaults.

#### Scenario: A single parameter is reset

- **WHEN** a user resets one parameter
- **THEN** that parameter returns to its declared default and no other parameter changes

#### Scenario: All parameters are reset

- **WHEN** a user resets all parameters
- **THEN** every parameter returns to its declared default, as a single undoable step

#### Scenario: A parameter already holds its default

- **WHEN** a parameter's value equals its declared default
- **THEN** the reset affordance for it indicates there is nothing to reset

### Requirement: Preset selection

The inspector SHALL offer the shader's declared presets and apply the chosen one to the selected object.

#### Scenario: A preset is chosen

- **WHEN** a user chooses a preset
- **THEN** the object's parameters take the preset's values, the controls update, and the canvas re-renders

#### Scenario: A preset is applied over edited values

- **WHEN** a preset is applied to an object whose parameters were edited
- **THEN** the preset's values replace them, as a single undoable step

### Requirement: Panel states without a shader selection

The inspector SHALL show an explanatory state when there is no selection, when several objects are selected, and when the selected object's fill is not a shader.

#### Scenario: Nothing is selected

- **WHEN** no object is selected
- **THEN** the inspector explains that selecting an object shows its controls

#### Scenario: Several objects are selected

- **WHEN** more than one object is selected
- **THEN** the inspector reports how many are selected rather than showing one object's parameters

#### Scenario: The selected object has a solid fill

- **WHEN** the selected object's fill is a solid color
- **THEN** the inspector shows the fill controls for a solid color and offers to replace the fill with a shader
