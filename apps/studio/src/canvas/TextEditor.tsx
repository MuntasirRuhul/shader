import { isTextObject, type CanvasDocument } from '@shader/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ViewportState } from '../store/slices';
import styles from './TextEditor.module.css';
import { canvasRectToScreen } from './viewport';

export interface TextEditorProps {
  readonly document: CanvasDocument;
  readonly editingId: string;
  readonly viewport: ViewportState;
  /** Called with the final content; an empty result discards the object. */
  readonly onCommit: (objectId: string, text: string) => void;
  readonly onCancel: (objectId: string) => void;
}

/**
 * Edits a text object in place.
 *
 * A real textarea overlays the object rather than the canvas capturing keys
 * itself, so selection, composition for non-Latin input, and the platform's
 * own editing shortcuts all work without being reimplemented.
 */
export function TextEditor({ document, editingId, viewport, onCommit, onCancel }: TextEditorProps) {
  const object = document.objects.find((candidate) => candidate.id === editingId);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(object && isTextObject(object) ? object.text : '');

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    element.focus();
    element.select();
  }, [editingId]);

  // Grow to hold what has been typed. The browser is the only thing that knows
  // where it actually broke the lines, so it is asked rather than predicted —
  // a height worked out here disagrees by a line sooner or later, and a
  // textarea hides whatever does not fit.
  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || !object || !isTextObject(object)) return;

    const { fontSize, lineHeight } = object.textSettings;
    const oneLine = fontSize * lineHeight * viewport.zoom;

    element.style.height = 'auto';
    // Never smaller than a line: a measure taken before the browser has laid
    // the text out reads zero, and a collapsed editor has nowhere to put the
    // caret.
    element.style.height = `${String(Math.max(element.scrollHeight, oneLine))}px`;
  }, [value, viewport.zoom, editingId, object]);

  if (!object || !isTextObject(object)) return null;

  const type = object.textSettings;

  // The editor is exactly as wide as the object, always. Sizing it to the
  // words instead left a gap between where it ended and where the object's
  // box did — two edges, one object.
  const screen = canvasRectToScreen(
    { x: object.x, y: object.y, width: object.width, height: object.height },
    viewport,
  );

  return (
    <textarea
      aria-label="Edit text"
      className={styles.editor}
      onBlur={() => {
        onCommit(editingId, value);
      }}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onKeyDown={(event) => {
        // Escape abandons the edit; Enter with the accelerator commits, leaving
        // a bare Enter free to insert a line break.
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel(editingId);
        } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onCommit(editingId, value);
        }
      }}
      ref={textRef}
      style={{
        left: `${String(screen.x)}px`,
        top: `${String(screen.y)}px`,
        width: `${String(screen.width)}px`,
        fontFamily: type.fontFamily,
        fontSize: `${String(type.fontSize * viewport.zoom)}px`,
        fontWeight: type.fontWeight,
        lineHeight: type.lineHeight,
        letterSpacing: `${String(type.letterSpacing * viewport.zoom)}px`,
        textAlign: type.align,
      }}
      value={value}
    />
  );
}
