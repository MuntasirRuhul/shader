## Purpose

Defines the application frame that hosts every other capability — the shader library panel, the canvas stage, the inspector panel, and the floating tool bar — including how those regions size, collapse, and stay reachable.

## ADDED Requirements

### Requirement: Three-region layout

The shell SHALL present three regions: a left library panel, a center canvas stage, and a right inspector panel. The canvas stage SHALL absorb all space not taken by the panels.

#### Scenario: Application loads

- **WHEN** the application finishes loading
- **THEN** the library panel, canvas stage, and inspector panel are all visible
- **AND** the canvas stage fills the remaining width between them

#### Scenario: Window is resized

- **WHEN** the browser window is resized
- **THEN** the panels retain their widths
- **AND** the canvas stage grows or shrinks to absorb the difference

### Requirement: Collapsible panels

Each side panel SHALL be independently collapsible and restorable. Collapse state SHALL persist across sessions.

#### Scenario: A panel is collapsed

- **WHEN** a user collapses a side panel
- **THEN** that panel is hidden, the canvas stage expands into the freed space, and the other panel is unaffected

#### Scenario: A collapsed panel is restored

- **WHEN** a user restores a collapsed panel
- **THEN** the panel reappears at the width it had before collapsing

#### Scenario: Application is reopened

- **WHEN** a user reopens the application after collapsing a panel
- **THEN** that panel is still collapsed

### Requirement: Resizable panels

Side panels SHALL be resizable by dragging their inner edge, within defined minimum and maximum widths. Panel widths SHALL persist across sessions.

#### Scenario: A panel is dragged wider

- **WHEN** a user drags a panel's inner edge
- **THEN** the panel width follows the pointer within its allowed range
- **AND** the canvas stage adjusts continuously

#### Scenario: A panel is dragged past its limit

- **WHEN** a drag would take a panel below its minimum or above its maximum width
- **THEN** the width clamps at the limit rather than exceeding it

### Requirement: Floating canvas toolbar

The shell SHALL present a floating toolbar over the canvas stage, horizontally centered near its lower edge, containing the canvas tool controls.

#### Scenario: Toolbar is displayed over the canvas

- **WHEN** the canvas stage is visible
- **THEN** the toolbar floats above the canvas content, centered horizontally near the lower edge
- **AND** it remains fully within the canvas stage bounds as panels collapse, expand, or resize

#### Scenario: Canvas content sits beneath the toolbar

- **WHEN** canvas content is positioned underneath the floating toolbar
- **THEN** pointer interaction with that content is blocked only within the toolbar's own bounds, not across the full stage width

### Requirement: Regions are composed through slots

The shell SHALL accept the contents of each region as injected content and SHALL NOT depend on any specific feature's implementation.

#### Scenario: Region content is substituted

- **WHEN** a region is supplied with different content
- **THEN** the shell renders it without modification to the shell
- **AND** layout, collapse, resize, and persistence behavior are unchanged

### Requirement: Keyboard reachability

All shell regions and their controls SHALL be reachable by keyboard in a predictable order, and each region SHALL be identifiable to assistive technology.

#### Scenario: A user tabs through the application

- **WHEN** a user moves focus with the keyboard from the start of the document
- **THEN** focus proceeds through the regions in a consistent, documented order
- **AND** focus never becomes trapped in a region that has no dismiss action

#### Scenario: Assistive technology enumerates the page

- **WHEN** assistive technology lists the page's regions
- **THEN** the library panel, canvas stage, inspector panel, and toolbar are each announced with a distinct label

### Requirement: Unsupported rendering environment

When the browser cannot provide the rendering context the canvas requires, the shell SHALL display an explicit unsupported message in place of the canvas stage.

#### Scenario: Required rendering context is unavailable

- **WHEN** the application loads in a browser that cannot provide the required rendering context
- **THEN** the canvas stage is replaced by a message stating the requirement
- **AND** the application does not present a blank or silently broken canvas
