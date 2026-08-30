## Context

Identifiers come from a module-level counter that starts at zero each session. Nothing connects it to the contents of a document that arrives from outside — see `proposal.md` for how that surfaces.

The comment beside the counter states the assumption that failed: identifiers only have to be unique within a document, so a counter suffices. The first half is true. The second does not follow, because a document can outlive the counter that produced it.

## Goals / Non-Goals

**Goals:**

- Make the collision impossible to reintroduce, rather than fixing the instances that exist today.
- Repair documents already carrying duplicates, without discarding anything.
- Keep identifiers readable in an exported file and deterministic under test.

**Non-Goals:**

- Global uniqueness. Identifiers are scoped to a document and nothing outside one refers to them. Making them unique across documents would solve a problem nobody has.
- A document format change. The repair alters values, not shape, so a repaired document stays readable by any build that reads the current format.

## Decisions

### Adoption advances the counter, rather than callers remembering to

The counter advance and the duplicate repair both live inside the single function that adopts a document. Every path that brings a document in from outside — restore, import, replace — goes through it.

*Why:* this bug exists because adopting a document and preparing the identifier counter were two separate things a caller had to do in order, and the second was never written. A rule of the form "remember to also call advance" fails the same way the next time a path is added. Making adoption the thing that advances removes the opportunity.

*Consequence:* there is one place to look, and a new adoption path gets the behaviour by construction rather than by review.

### Identifiers stay a counter, not random values

The generator keeps producing `rectangle-1`, `rectangle-2`, and so on.

*Why:* random identifiers would make collisions vanishingly unlikely without any load-time bookkeeping, which is genuinely simpler. But they are worse in three ways that matter here. An exported document becomes unreadable to a person scanning it. Tests that assert on exact identifiers — several already do — would need rewriting around opaque values. And randomness would not repair the documents already carrying duplicates, so the repair path is needed either way.

*Alternative considered:* a short random suffix on the counter, giving readable-ish but collision-free values. Rejected as the worst of both: still needs the repair path, still noisy in an export, and it hides rather than removes the coupling.

*Revisit when:* documents are merged across sessions or synced between users. At that point identifiers really do need to be unique beyond one document, and a counter genuinely will not suffice.

### Repair keeps the earliest holder's identifier

Where several objects share an identifier, the first in document order keeps it and the later ones are renamed.

*Why:* it makes the repair deterministic — the same document repairs to the same result every time — and it minimises change, since the common case is one late arrival colliding with something long-established. Renaming the earlier object instead would be equally correct and needlessly disruptive to whichever object the user thinks of as original.

### The repair is reported, not silent

Loading a repaired document tells the user it happened.

*Why:* a silent repair is a change to the user's document that they did not ask for and cannot see. It is a small change and a harmless one, but the same reasoning that makes an unrecognised object type a refusal rather than a silent drop applies here: the user should know what the application did to their work.

*Consequence:* the existing surface for reporting a persistence problem carries it, so nothing new is needed to display it.

## Risks / Trade-offs

- **A future adoption path bypasses the function** → The reason the advance lives inside adoption rather than beside it. A path that does not adopt is not loading a document, and the tests address objects by identifier after each existing path.
- **An exported document's identifiers change after a repair** → Harmless, since nothing outside a document references them, but it means an export is not byte-identical across the repair. Named here so it is not mistaken for data loss.
- **The counter remains session-global** → Correct while a session edits one document at a time, and the revisit condition is stated above.

## Migration Plan

No format change and no version bump. Documents carrying duplicates are repaired the next time they load, which is the migration. A document that never had duplicates is untouched.

## Open Questions

None.
