## ADDED Requirements

### Requirement: Objects are drawn through the viewport

The runtime SHALL place every object according to the viewport it is given — a magnification and a translation — so that what is drawn coincides with what any other layer draws for the same object. An object's stored coordinates SHALL NOT change when the viewport does.

#### Scenario: The view is panned

- **WHEN** the viewport is translated
- **THEN** every object is drawn translated by the same amount
- **AND** no object's stored position changes

#### Scenario: The view is magnified

- **WHEN** the viewport is magnified
- **THEN** every object is drawn at that magnification, about the same point the rest of the canvas magnifies about

#### Scenario: An object is selected at a moved view

- **WHEN** an object is selected while the view is panned or magnified
- **THEN** what is drawn for that object and what is drawn to indicate its selection occupy the same region of the screen

#### Scenario: No viewport is supplied

- **WHEN** the runtime is given no viewport
- **THEN** it draws as though the view were unmagnified and untranslated, which is what it did before viewports existed

### Requirement: An object far from the origin is placed as precisely as one near it

The runtime SHALL compute an object's placement relative to the current view before reducing it to the precision the graphics program receives, so that placement accuracy follows the object's distance from the view rather than its distance from the document origin.

#### Scenario: A distant object is inspected closely

- **WHEN** an object far from the document origin is viewed at high magnification
- **THEN** it is drawn at the position it holds, without visible drift or jitter between frames
- **AND** it holds still while the view does

#### Scenario: The view moves across a distant region

- **WHEN** the view is panned smoothly through a region far from the origin
- **THEN** objects move smoothly with it, without stepping or snapping

### Requirement: What a shader is told about its object is independent of the view

The size the runtime reports to a shader SHALL be the object's size in canvas coordinates, not the size it currently occupies on screen. Magnifying the view SHALL magnify what a shader drew rather than causing it to draw something different.

#### Scenario: An object is magnified

- **WHEN** the view magnifies an object whose shader reads the reported size
- **THEN** the shader is told the same size as before, and its output is magnified rather than recomputed at a new scale

#### Scenario: A shader reacts to the pointer while the view is moved

- **WHEN** the pointer is over an object at any pan or magnification
- **THEN** the position the shader receives is expressed in the object's own coordinates, unchanged by where the view happens to be
