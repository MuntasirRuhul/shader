## 1. Capture the defect

- [ ] 1.1 Add a failing test showing that an object created after a document is adopted reuses an identifier that document already holds; verify it fails against the current code and names the duplicate
- [ ] 1.2 Add a failing test showing that a document adopted with duplicate identifiers keeps them; verify it fails against the current code

## 2. Make the collision impossible

- [ ] 2.1 Add a function that adopts a document — advancing the identifier counter past every identifier the document holds and repairing any duplicates — and returns the document to use together with whether it was repaired; verify the tests from 1.1 and 1.2 now pass
- [ ] 2.2 Verify the repair keeps the earliest holder's identifier, renames only later duplicates, preserves document order, and leaves each object's type, geometry, fill, and parameter values unchanged
- [ ] 2.3 Verify a document whose identifiers are already unique passes through untouched and reports no repair
- [ ] 2.4 Verify the counter advance handles identifiers that do not match the generated pattern, so a hand-edited or externally produced document cannot defeat it

## 3. Route every adoption path through it

- [ ] 3.1 Adopt the document when one is restored from local storage; verify an object created afterwards does not collide
- [ ] 3.2 Adopt the document when one is imported from a file; verify an object created afterwards does not collide
- [ ] 3.3 Adopt the document wherever the editor replaces one; verify an object created afterwards does not collide, including when a second document is adopted in the same session
- [ ] 3.4 Report a repair through the existing surface for a persistence problem; verify the message appears and the editor opens the repaired document rather than refusing it

## 4. Verify what the defect actually broke

- [ ] 4.1 Verify that selecting an object created after a load shows that object's own parameters in the inspector, which is how the defect first surfaced
- [ ] 4.2 Verify that editing and deleting an object created after a load affect that object and no other
- [ ] 4.3 Verify in the browser: load a document, add a shader, and confirm the inspector follows the new object rather than an older one
- [ ] 4.4 Verify the full root script set passes on a clean checkout
