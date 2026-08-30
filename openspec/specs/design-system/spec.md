## Purpose

Provides the single visual and interaction vocabulary — design tokens, theming, and accessible UI primitives — that every product surface is built from, so appearance and behavior stay consistent as the application grows.

## Requirements

### Requirement: Token-based styling

The design system SHALL expose all visual values — color, spacing, radius, typography, elevation, and motion — as named tokens. Product surfaces SHALL reference tokens rather than literal values.

#### Scenario: A surface renders using tokens

- **WHEN** any product surface renders a visual property covered by the token set
- **THEN** the rendered value resolves from a named token
- **AND** changing that token's definition changes every surface using it, with no per-surface edits

#### Scenario: A literal value bypasses the token layer

- **WHEN** source code sets a color, spacing, radius, or typography value literally instead of via a token
- **THEN** automated checks report it as a violation

### Requirement: Light and dark themes

The design system SHALL provide light and dark themes. Every token that carries a visual appearance SHALL have a defined value in both themes.

#### Scenario: Theme is switched

- **WHEN** the active theme changes between light and dark
- **THEN** every surface updates to the new theme's values
- **AND** no element becomes invisible, unreadable, or loses its focus indicator

#### Scenario: A token lacks a value in one theme

- **WHEN** a token is defined in one theme but not the other
- **THEN** automated checks fail and report the missing definition

#### Scenario: No theme has been chosen

- **WHEN** a user opens the application without a previously stored theme preference
- **THEN** the theme follows the operating system preference
- **AND** it updates live if the operating system preference changes while the application is open

#### Scenario: A theme preference is stored

- **WHEN** a user explicitly selects a theme
- **THEN** that choice persists across sessions and overrides the operating system preference until cleared

### Requirement: Accessible interactive primitives

Interactive primitives SHALL be operable by keyboard alone and SHALL expose correct roles, names, and states to assistive technology.

#### Scenario: Keyboard-only operation

- **WHEN** a user operates any interactive primitive using only a keyboard
- **THEN** the primitive can be reached, focused, activated, and dismissed
- **AND** a visible focus indicator is present at every focusable step

#### Scenario: A layer that traps focus is opened

- **WHEN** a primitive that owns focus, such as a menu or dialog, is opened
- **THEN** focus moves into it, is confined to it while open, and returns to the element that opened it on dismissal

#### Scenario: Assistive technology inspects a primitive

- **WHEN** assistive technology queries an interactive primitive
- **THEN** the primitive reports a role, an accessible name, and its current state

### Requirement: Primitives are presentation-only

Design system primitives SHALL NOT contain application domain logic. They SHALL communicate solely through their declared inputs and events.

#### Scenario: A primitive is used in isolation

- **WHEN** a primitive is rendered outside the application, with only its declared inputs supplied
- **THEN** it renders and behaves correctly
- **AND** it does not read or write application state directly
