import { isTextObject, type CanvasDocument } from '@shader/core';
import { useEffect, useRef, useState } from 'react';
import type { ViewportState } from '../store/slices';
import styles from './TextEditor.module.css';
import { fitTextBox } from './textRasterizer';
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

  if (!object || !isTextObject(object)) return null;

  const type = object.textSettings;
  // The box follows what is being typed, so the editor is the shape the object
  // will take rather than a fixed rectangle it has to be squeezed into. A box
  // sized by hand keeps its width; only the height follows the words.
  const box = fitTextBox(value, type, object.text === '' ? undefined : object.width);

  const screen = canvasRectToScreen(
    { x: object.x, y: object.y, width: box.width, height: box.height },
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
        height: `${String(screen.height)}px`,
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
