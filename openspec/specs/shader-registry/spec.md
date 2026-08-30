## Purpose

Defines the declarative contract a shader must satisfy to appear in the application — its metadata, parameter schema, and presets — so shaders can be added without modifying the shell, the inspector, or the runtime.

## Requirements

### Requirement: Shaders are declared as manifests

A shader SHALL be described by a manifest containing its identity, display metadata, shader program sources, a parameter schema, and at least one preset. A shader SHALL NOT supply user interface code.

#### Scenario: A manifest is registered

- **WHEN** a shader manifest is added to the registry
- **THEN** the shader becomes selectable in the library, renderable on the canvas, and editable in the inspector
- **AND** no shell, inspector, or runtime source is modified to accommodate it

#### Scenario: A manifest supplies interface code

- **WHEN** a manifest attempts to supply its own control or panel rendering
- **THEN** the manifest is rejected as invalid

### Requirement: Code a manifest may carry is bounded

A manifest MAY carry a function that advances its simulation state. It SHALL NOT carry code that renders, that builds controls, or that reaches the document or the browser.

#### Scenario: A manifest carries an advance function

- **WHEN** a manifest carries a function that advances its state
- **THEN** the registry accepts it

#### Scenario: A manifest carries interface code

- **WHEN** a manifest attempts to supply its own control or panel rendering
- **THEN** the manifest is rejected as invalid, as it was before simulation existed

### Requirement: A manifest may declare rendering passes

A manifest MAY declare a sequence of passes instead of a single program. Each pass declares its own program and what it reads. A manifest declaring no passes SHALL behave as one declaring a single pass drawing to the object.

#### Scenario: A manifest declares several passes

- **WHEN** a manifest declares a sequence of passes
- **THEN** the registry accepts it
- **AND** the last pass is the one whose output fills the object

#### Scenario: A pass reads an earlier pass

- **WHEN** a pass declares that it reads the output of a pass before it
- **THEN** the registry accepts it

#### Scenario: A pass reads a pass that comes after it

- **WHEN** a pass declares that it reads the output of a later pass
- **THEN** registration fails, naming the shader and the two passes, since that output does not exist yet

#### Scenario: A pass reads its own previous frame

- **WHEN** a pass declares that it reads what it wrote on the previous frame
- **THEN** the registry accepts it, since the value exists from the frame before

#### Scenario: A manifest declares no passes

- **WHEN** a manifest declares a single fragment program and no passes
- **THEN** it renders exactly as it did before passes existed

### Requirement: Manifest validation

The registry SHALL validate every manifest when it is registered and SHALL reject invalid manifests with a message identifying the shader and the specific failure.

#### Scenario: A manifest is missing a required field

- **WHEN** a manifest omits a required field
- **THEN** registration fails and the reported error names the shader and the missing field

#### Scenario: Two manifests share an identifier

- **WHEN** a manifest is registered with an identifier already in use
- **THEN** registration fails and the reported error names the conflicting identifier

#### Scenario: A preset value violates its parameter definition

- **WHEN** a preset sets a parameter to a value outside its declared range or outside its declared set of options
- **THEN** registration fails and the reported error names the shader, the preset, and the parameter

#### Scenario: A valid manifest is registered

- **WHEN** a manifest satisfies every validation rule
- **THEN** registration succeeds and the shader is listed by the registry

### Requirement: Parameter schema vocabulary

A manifest's parameter schema SHALL declare each parameter's identifier, display label, type, default value, and any constraints. The schema SHALL support numeric parameters with a range and step, boolean parameters, color parameters, enumerated parameters with a fixed set of options, two-component vector parameters, and repeatable groups whose entries each carry their own parameters.

#### Scenario: A numeric parameter is declared

- **WHEN** a parameter declares a numeric type with a minimum, maximum, and step
- **THEN** the registry accepts it
- **AND** its declared default falls within the declared range

#### Scenario: An enumerated parameter is declared

- **WHEN** a parameter declares an enumerated type with a set of options
- **THEN** the registry accepts it
- **AND** its declared default is one of those options

#### Scenario: A repeatable group is declared

- **WHEN** a parameter declares a repeatable group with per-entry parameters and a maximum entry count
- **THEN** the registry accepts it
- **AND** a maximum entry count is required, so the runtime can size its resources

#### Scenario: An unknown parameter type is declared

- **WHEN** a parameter declares a type outside the supported vocabulary
- **THEN** registration fails and the reported error names the parameter and the unsupported type

### Requirement: Parameter grouping and ordering

The parameter schema SHALL allow parameters to be assigned to named groups and SHALL preserve the declared order of both groups and the parameters within them.

#### Scenario: Grouped parameters are read back

- **WHEN** the parameter schema of a registered shader is read
- **THEN** groups and parameters appear in the order the manifest declared them

#### Scenario: A parameter declares no group

- **WHEN** a parameter is declared without a group
- **THEN** it is assigned to a default group rather than being omitted

### Requirement: Presets

Each manifest SHALL declare one or more named presets. A preset SHALL supply a complete, valid set of values for the shader's parameters.

#### Scenario: A preset is applied

- **WHEN** a preset is applied to a shader
- **THEN** every parameter takes the preset's value for that parameter

#### Scenario: A preset omits a parameter

- **WHEN** a preset does not specify a value for a parameter
- **THEN** that parameter takes its declared default

### Requirement: Registry lookup

The registry SHALL let callers list all registered shaders and retrieve a single shader by its identifier.

#### Scenario: Shaders are listed

- **WHEN** a caller requests the list of registered shaders
- **THEN** every successfully registered shader is returned with its display metadata

#### Scenario: A shader is requested by a known identifier

- **WHEN** a caller requests a shader by an identifier that is registered
- **THEN** that shader's manifest is returned

#### Scenario: A shader is requested by an unknown identifier

- **WHEN** a caller requests a shader by an identifier that is not registered
- **THEN** the registry reports that the shader was not found, rather than returning an empty or partial manifest

### Requirement: Manifests are serializable and versioned

Every manifest SHALL carry a schema version, and its parameter schema and presets SHALL be expressible as plain serializable data.

#### Scenario: A parameter schema is serialized

- **WHEN** a registered shader's parameter schema and presets are serialized and deserialized
- **THEN** the result is equivalent to the original

#### Scenario: A manifest declares an unsupported schema version

- **WHEN** a manifest declares a schema version the application does not support
- **THEN** registration fails and the reported error names the shader and both versions
