## Purpose

Holds what the user is building — a scene of objects with shader fills, their stacking order and selection state — as a versioned document that persists locally and can be exported to and imported from a file.

## ADDED Requirements

### Requirement: Scene of objects

A document SHALL contain an ordered collection of objects. Each object SHALL have a stable identifier, a type, a position, a size, a rotation, an opacity, a visibility state, a locked state, and a fill.

#### Scenario: An object is added

- **WHEN** an object is added to the document
- **THEN** it receives an identifier unique within the document
- **AND** it appears in the scene with the supplied geometry and fill

#### Scenario: An object is removed

- **WHEN** an object is removed
- **THEN** it no longer appears in the scene
- **AND** the remaining objects keep their identifiers and relative order

### Requirement: Supported object types

The document SHALL support rectangle, ellipse, and text objects. Text objects SHALL additionally carry their string content and type settings.

#### Scenario: A text object is created

- **WHEN** a text object is created
- **THEN** it carries editable string content alongside the properties common to all objects

#### Scenario: An unsupported object type is loaded

- **WHEN** a document containing an object of an unrecognized type is loaded
- **THEN** loading fails with a message naming the unrecognized type, rather than silently discarding the object

### Requirement: Shader fills

An object's fill SHALL be either a solid color or a shader. A shader fill SHALL reference a registered shader by identifier and carry that shader's parameter values.

#### Scenario: A shader fill is applied to an object

- **WHEN** a shader is applied as an object's fill
- **THEN** the object renders with that shader
- **AND** the object stores its own parameter values, independent of any other object using the same shader

#### Scenario: Two objects use the same shader

- **WHEN** two objects use the same shader and one object's parameter is changed
- **THEN** only that object's appearance changes

#### Scenario: A fill references an unregistered shader

- **WHEN** a document is loaded whose object references a shader identifier that is not registered
- **THEN** the object is shown in an unresolved-fill state that names the missing shader
- **AND** the rest of the document loads and remains editable

### Requirement: Stacking order

Objects SHALL have an explicit front-to-back order that the user can change. Objects later in the order SHALL be drawn above earlier ones.

#### Scenario: An object is raised

- **WHEN** an object is moved forward in the order
- **THEN** it is drawn above the objects it was previously behind

#### Scenario: Overlapping objects are rendered

- **WHEN** two objects overlap
- **THEN** the one later in the order is drawn on top

### Requirement: Selection

The document SHALL track which objects are selected. Selection SHALL support one object, several objects, or none.

#### Scenario: An object is selected

- **WHEN** an object is selected
- **THEN** it becomes the selection and any previous selection is replaced

#### Scenario: An object is added to the selection

- **WHEN** an object is selected with the additive modifier held
- **THEN** it joins the existing selection rather than replacing it

#### Scenario: A selected object is deleted

- **WHEN** a selected object is deleted
- **THEN** it is removed from the selection as well as from the scene

#### Scenario: A locked object is targeted for selection

- **WHEN** a locked object is clicked on the canvas
- **THEN** it is not selected, and selection falls through to whatever is beneath it

### Requirement: Undo and redo

The document SHALL record user edits as reversible steps and SHALL support undoing and redoing them in order.

#### Scenario: An edit is undone

- **WHEN** a user undoes after making an edit
- **THEN** the document returns to its state immediately before that edit

#### Scenario: An undone edit is redone

- **WHEN** a user redoes after undoing
- **THEN** the edit is reapplied

#### Scenario: A new edit follows an undo

- **WHEN** a user makes a new edit after undoing
- **THEN** the previously undone edits can no longer be redone

#### Scenario: A parameter is dragged continuously

- **WHEN** a user drags a control through many intermediate values and releases it
- **THEN** the whole drag is recorded as one undo step, not one step per intermediate value

### Requirement: Versioned serializable format

A document SHALL serialize to plain data carrying an explicit format version. Deserializing a serialized document SHALL reproduce an equivalent document.

#### Scenario: A document is serialized and restored

- **WHEN** a document is serialized and then deserialized
- **THEN** the resulting document is equivalent in objects, order, fills, and parameter values

#### Scenario: A document declares a newer format version

- **WHEN** a document declares a format version newer than the application supports
- **THEN** loading is refused with a message naming both versions, rather than partially loading

#### Scenario: A document declares an older supported format version

- **WHEN** a document declares an older format version that the application still supports
- **THEN** it is migrated to the current version on load and the user is not required to act

### Requirement: Local persistence

The application SHALL persist the current document locally and restore it when the user returns.

#### Scenario: A user returns to the application

- **WHEN** a user reopens the application after making edits
- **THEN** the document is restored as it was at the last persisted point

#### Scenario: Local storage is unavailable or full

- **WHEN** the document cannot be persisted locally
- **THEN** the user is informed that changes are not being saved
- **AND** the application stays usable, with export still available

#### Scenario: Stored data cannot be parsed

- **WHEN** the locally persisted document cannot be parsed
- **THEN** the application starts from an empty document and informs the user, rather than failing to start

### Requirement: File export and import

The application SHALL export the current document to a file and import a document from a file.

#### Scenario: A document is exported

- **WHEN** a user exports the document
- **THEN** a file containing the serialized document is produced

#### Scenario: A previously exported document is imported

- **WHEN** a user imports a file that this application exported
- **THEN** the document is loaded and is equivalent to the one that was exported

#### Scenario: An unreadable file is imported

- **WHEN** a user imports a file that is not a valid document
- **THEN** the import is refused with a message explaining why
- **AND** the current document is left untouched

#### Scenario: Import would discard unsaved work

- **WHEN** a user imports a document while the current document has unsaved changes
- **THEN** the user is asked to confirm before the current document is replaced
