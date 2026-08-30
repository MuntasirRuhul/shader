## Purpose

Governs the catalogue of shaders the application ships — what every one of them must satisfy to be offered to a user, and how the library presents them — independently of what any individual shader draws.

## Requirements
### Requirement: Every shipped shader is valid

Each shader in the catalogue SHALL satisfy the manifest contract, and the application SHALL fail to start rather than offer an invalid one.

#### Scenario: The catalogue is loaded

- **WHEN** the application registers its shipped shaders
- **THEN** every one of them passes manifest validation

#### Scenario: An invalid shader is added to the catalogue

- **WHEN** a shader that fails validation is added to the shipped set
- **THEN** registration fails with the error naming that shader
- **AND** the application does not start with the shader silently omitted

### Requirement: Every shipped shader honours the rendering contract

Each shader SHALL address its own object through the coordinates the runtime supplies, and SHALL NOT read the coordinates of the drawing surface.

#### Scenario: A shader addresses its object

- **WHEN** a shipped shader's source is examined
- **THEN** it derives position from the object-local coordinates the runtime provides
- **AND** it does not read the fragment's position on the drawing surface

#### Scenario: An object is moved or rotated

- **WHEN** an object filled by a shipped shader is moved, resized, or rotated
- **THEN** the shader fills the object in its new placement
- **AND** the result does not shift with the object's position on screen

### Requirement: A repeatable group matches what its shader allocates

Where a shader declares a repeatable group, the group's maximum entry count SHALL equal the number of entries the shader's program allocates for.

#### Scenario: A shader with a repeatable group is registered

- **WHEN** a shipped shader declaring a repeatable group is registered
- **THEN** its declared maximum matches the fixed size its program allocates

#### Scenario: Entries are added up to the maximum

- **WHEN** a user adds entries until the group reports it is full
- **THEN** every entry is drawn
- **AND** no entry is silently discarded for want of room in the program

### Requirement: Presets are complete

Each shipped shader SHALL offer at least one preset, and every preset SHALL resolve to a value for each of that shader's parameters.

#### Scenario: A preset is resolved

- **WHEN** any preset of a shipped shader is resolved
- **THEN** every parameter the shader declares has a value

#### Scenario: A preset specifies only some parameters

- **WHEN** a preset names a subset of the shader's parameters
- **THEN** the parameters it does not name take their declared defaults

### Requirement: A library entry previews its colours

Each library entry SHALL preview the colours its shader's first preset actually uses, including colours carried inside a repeatable group.

#### Scenario: A preset keeps its colours in a repeatable group

- **WHEN** a shader's first preset declares its colours inside a repeatable group rather than as top-level parameters
- **THEN** the entry's preview is built from those colours

#### Scenario: A shader declares a background colour

- **WHEN** a shader declares a colour representing what its subject sits on
- **THEN** that colour is excluded from the preview, which shows the subject rather than its backdrop

#### Scenario: A preset declares no colours at all

- **WHEN** a shader's first preset carries no colour values
- **THEN** the entry shows a neutral placeholder rather than an empty or invisible preview

### Requirement: Built-in shaders are not offered

A shader the application uses to implement its own behaviour SHALL NOT appear in the library.

#### Scenario: The library is listed

- **WHEN** the library's entries are listed
- **THEN** shaders serving the application's own rendering, such as the one drawing a plain fill, are absent

#### Scenario: A built-in shader is still needed for rendering

- **WHEN** an object requires a shader the library does not offer
- **THEN** the registry still resolves it, and the object renders
### Requirement: The library offers shaders, not presets

The library SHALL present each shader as its own entry, labelled with the shader's name, since the shader is what a user is choosing. A preset SHALL be chosen in the parameter panel, which offers the presets of whichever shader is selected.

#### Scenario: A shader with several presets is listed

- **WHEN** a shader declaring several presets is in the catalogue
- **THEN** the library lists exactly one entry for it, labelled with the shader's name

#### Scenario: Two shaders declare presets sharing a name

- **WHEN** two shaders each declare a preset with the same name
- **THEN** the library still lists one entry per shader, and the two are distinguishable by name

#### Scenario: An entry is chosen with nothing selected

- **WHEN** a user chooses a library entry while no object is selected
- **THEN** an object is created carrying that shader and its first preset's values, and becomes the selection

#### Scenario: An entry is chosen with an object selected

- **WHEN** a user chooses a library entry while an object is selected
- **THEN** that object's fill becomes the chosen shader with its first preset, and no new object is created

#### Scenario: A different preset is wanted

- **WHEN** a user wants a preset other than the first
- **THEN** they choose the shader from the library and the preset from the parameter panel
