import type { ToolId } from '../store/slices';

/**
 * Keyboard handling for the canvas.
 *
 * Every shortcut here is suppressed while the user is typing. A canvas tool
 * bound to a bare letter would otherwise fire mid-word, and Delete would
 * destroy an object instead of a character.
 */

/** How far an arrow key moves the selection. */
export const NUDGE_STEP = 1;
export const COARSE_NUDGE_STEP = 10;

export const TOOL_SHORTCUTS: Readonly<Record<string, ToolId>> = {
  v: 'select',
  r: 'shape',
  t: 'text',
};

/**
 * Whether keystrokes belong to a text entry rather than the canvas.
 *
 * Covers inputs, textareas, and anything marked editable — a shader name
 * field, a text object being edited, or a future rich-text surface.
 */
export function isTextEntryFocused(active: Element | null): boolean {
  if (!active) return false;

  if (active instanceof HTMLInputElement) {
    // Buttons and checkboxes are inputs too, but they take no text.
    const nonTextTypes = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset']);
    return !nonTextTypes.has(active.type);
  }

  if (active instanceof HTMLTextAreaElement) return true;
  if (active instanceof HTMLSelectElement) return true;
  if (active instanceof HTMLElement && active.isContentEditable) return true;

  return false;
}

/** The key that turns any tool into a pan while it is held. */
export const PAN_MODIFIER_KEY = ' ';

/**
 * Whether the focused element would take a space keystroke for itself.
 *
 * Space is a character in a text field and a press on a button — both older
 * claims than panning. A canvas that took it regardless would swallow a word
 * in the first case and, in the second, leave every toolbar button dead to the
 * keyboard.
 */
export function focusTakesSpace(active: Element | null): boolean {
  if (isTextEntryFocused(active)) return true;
  if (!active) return false;

  if (active instanceof HTMLButtonElement) return true;
  if (active instanceof HTMLInputElement) return true;
  if (active instanceof HTMLSelectElement) return true;
  if (active instanceof HTMLAnchorElement) return active.hasAttribute('href');
  if (active.tagName === 'SUMMARY') return true;

  // Anything presenting itself as a control is activated by space too.
  const role = active.getAttribute('role');
  return role !== null && ACTIVATED_BY_SPACE.has(role);
}

const ACTIVATED_BY_SPACE = new Set([
  'button',
  'checkbox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'switch',
  'tab',
]);

export interface PanModifierContext {
  readonly key: string;
  /** Command on macOS, Control elsewhere. */
  readonly accelKey: boolean;
  /** Whether whatever has focus would consume the keystroke itself. */
  readonly focusTakesSpace: boolean;
}

/**
 * Whether a keystroke means "pan while I hold this".
 *
 * Held apart from `commandFor` because it is not a command: it does not happen
 * on the keystroke, it changes what dragging means until it is released.
 */
export function isPanModifier(event: PanModifierContext): boolean {
  return event.key === PAN_MODIFIER_KEY && !event.accelKey && !event.focusTakesSpace;
}

export type CanvasCommand =
  | { readonly kind: 'tool'; readonly tool: ToolId }
  | { readonly kind: 'nudge'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'delete' }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | { readonly kind: 'clear-selection' }
  | { readonly kind: 'zoom-to-fit' }
  | { readonly kind: 'zoom-to-selection' }
  | { readonly kind: 'zoom-reset' }
  | { readonly kind: 'toggle-chrome' };

export interface KeyContext {
  readonly key: string;
  readonly shiftKey: boolean;
  /** Command on macOS, Control elsewhere. */
  readonly accelKey: boolean;
  /** Whether a text entry currently has focus. */
  readonly textEntryFocused: boolean;
}

const ARROWS: Readonly<Record<string, { dx: number; dy: number }>> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

/**
 * The command a keystroke means, or `null` when it means nothing here.
 *
 * Written as a pure function so the whole shortcut map — including the
 * suppression rule — is testable without a DOM.
 */
export function commandFor(event: KeyContext): CanvasCommand | null {
  // Undo and redo are accelerator combinations, so they stay available while
  // typing, where the browser routes them to the text field anyway.
  if (event.accelKey) {
    const key = event.key.toLowerCase();
    if (key === 'z') return event.shiftKey ? { kind: 'redo' } : { kind: 'undo' };
    if (key === 'y') return { kind: 'redo' };
    return null;
  }

  if (event.textEntryFocused) return null;

  const arrow = ARROWS[event.key];
  if (arrow) {
    const step = event.shiftKey ? COARSE_NUDGE_STEP : NUDGE_STEP;
    return { kind: 'nudge', dx: arrow.dx * step, dy: arrow.dy * step };
  }

  if (event.key === 'Delete' || event.key === 'Backspace') return { kind: 'delete' };
  if (event.key === 'Escape') return { kind: 'clear-selection' };

  // Shift+1 fits everything, Shift+2 frames the selection, Shift+0 returns to
  // actual size — the conventional set in canvas tools.
  if (event.key === '1' && event.shiftKey) return { kind: 'zoom-to-fit' };
  if (event.key === '2' && event.shiftKey) return { kind: 'zoom-to-selection' };
  if (event.key === '0' && event.shiftKey) return { kind: 'zoom-reset' };

  // The panels get out of the way on one key, as they do in the reference.
  if (event.key === '\\') return { kind: 'toggle-chrome' };

  const tool = TOOL_SHORTCUTS[event.key.toLowerCase()];
  if (tool) return { kind: 'tool', tool };

  return null;
}
