## ADDED Requirements

### Requirement: Identifiers survive a load

Adopting a document from outside the current session SHALL NOT cause a later object to reuse an identifier that document already holds. This applies wherever a document is adopted — restored from local storage, imported from a file, or replaced in the editor.

#### Scenario: An object is created after a document is restored

- **WHEN** a document is restored and an object is then created
- **THEN** the new object's identifier differs from every identifier already in that document

#### Scenario: An object is created after a document is imported

- **WHEN** a document is imported from a file and an object is then created
- **THEN** the new object's identifier differs from every identifier already in that document

#### Scenario: Several objects are created after a load

- **WHEN** several objects are created after a document is adopted
- **THEN** each receives an identifier distinct from the others and from every identifier the document already held

#### Scenario: A document is adopted twice in one session

- **WHEN** one document is adopted, then a second holding higher identifiers, and an object is created
- **THEN** the new identifier collides with neither document's

#### Scenario: An object is addressed by identifier after a load

- **WHEN** an object created after a load is selected, edited, or deleted
- **THEN** the operation affects that object and no other

### Requirement: A document arriving with duplicate identifiers is repaired

When a document is adopted carrying identifiers that are not unique within it, the duplicates SHALL be given fresh identifiers rather than being carried forward, and the repair SHALL be reported.

#### Scenario: A stored document carries duplicates

- **WHEN** a document whose objects do not all have distinct identifiers is adopted
- **THEN** every object ends with an identifier unique within the document
- **AND** no object is discarded, and the order of objects is unchanged

#### Scenario: The first holder of an identifier keeps it

- **WHEN** two objects share an identifier
- **THEN** the earlier of the two keeps it and the later is given a fresh one
- **AND** the fresh identifier collides with nothing else in the document

#### Scenario: A repair is reported

- **WHEN** a document is repaired on load
- **THEN** the user is told the document was repaired
- **AND** the editor opens the repaired document rather than refusing it

#### Scenario: A document with distinct identifiers is left alone

- **WHEN** a document whose identifiers are already unique is adopted
- **THEN** every object keeps the identifier it was saved with
- **AND** nothing is reported

#### Scenario: Everything an object carries survives the repair

- **WHEN** an object is given a fresh identifier
- **THEN** its type, geometry, fill, and parameter values are unchanged
