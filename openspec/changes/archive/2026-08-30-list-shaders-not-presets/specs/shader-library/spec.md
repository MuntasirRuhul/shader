## REMOVED Requirements

### Requirement: The library offers presets, not shaders

**Reason**: Four shaders produced sixteen entries, several sharing a preset name, with nothing on the entry to say which shader it belonged to. The shader is what a user is choosing.

**Migration**: Replaced by "The library offers shaders, not presets". A preset other than the first is chosen in the parameter panel, which already offers them.

## ADDED Requirements

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

## MODIFIED Requirements

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
