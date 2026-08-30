## ADDED Requirements

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

### Requirement: Code a manifest may carry is bounded

A manifest MAY carry a function that advances its simulation state. It SHALL NOT carry code that renders, that builds controls, or that reaches the document or the browser.

#### Scenario: A manifest carries an advance function

- **WHEN** a manifest carries a function that advances its state
- **THEN** the registry accepts it

#### Scenario: A manifest carries interface code

- **WHEN** a manifest attempts to supply its own control or panel rendering
- **THEN** the manifest is rejected as invalid, as it was before simulation existed
