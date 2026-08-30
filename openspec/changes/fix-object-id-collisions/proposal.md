## Why

Objects created after a document is loaded reuse identifiers that document already contains. The identifier counter is a session-global integer starting at zero, and loading a document does not advance it past what is inside — so the next object created collides with an existing one.

The specification already requires that an object added to a document receive an identifier unique within it. This is a defect against that requirement, not a change to it.

It is not cosmetic. Objects are addressed by identifier, so a lookup returns whichever duplicate comes first. In practice the inspector shows a different object's parameters than the one selected, and an edit or a delete can land on the wrong object. It was hit repeatedly while porting shaders, and each time the workaround was to clear stored data.

Documents already saved carry the duplicates, so fixing generation alone would leave existing work broken.

## What Changes

- **Advance the identifier counter when a document is adopted**, so an object created afterwards cannot collide with one the document already holds. This applies wherever a document arrives from outside the session: restored from local storage, imported from a file, or replaced in the editor.
- **Repair a document that already contains duplicates** when it is loaded, giving the later objects fresh identifiers and reporting that it happened.
- **Regression tests** covering both, since neither is visible until something later addresses an object by identifier.

Repairing rather than refusing is a deliberate departure from how an unreadable document is treated. A document naming an object type this build does not understand is refused, because loading it would silently discard the user's work. A duplicate identifier is different: identifiers are internal, nothing outside the document references them, and no persisted state points at one — so renaming is lossless. Refusing would strand every document already saved with the defect, which is the opposite of what the user needs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `canvas-document`: adds what identifiers must satisfy across a load — that adopting a document cannot cause a later collision, and that a document arriving with duplicates is repaired rather than carried forward or refused.

## Impact

- **Shader core**: the document model's identifier generation, and the load path that adopts a document.
- **Application**: the editor store, where a document is adopted on restore, import, and replacement.
- **Stored documents**: those already carrying duplicates are repaired the next time they load. No format change and no version bump — the repair is to values, not to shape, so a repaired document is readable by any build that reads the current format.
- **Risk**: identifiers are visible in an exported file. A repaired document exports with different identifiers than it was saved with, which is harmless because nothing outside the document references them, but it does mean an export is not byte-identical across the repair.
