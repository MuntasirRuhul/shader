import { absolutePlacement, ancestorsOf, isHtmlObject, type CanvasDocument } from '@shader/core';
import { useEffect, useRef, useState } from 'react';
import type { ViewportState } from '../store/slices';
import { transientChannel, type TransientEdit } from '../store/transientChannel';
import { EDIT_MESSAGE, documentFor, HTML_MESSAGE, READY_MESSAGE } from './htmlDocument';
import styles from './HtmlLayer.module.css';
import { canvasToScreen } from './viewport';

/**
 * The markup blocks, drawn by the browser over the canvas.
 *
 * They cannot be drawn inside it: the canvas is WebGL, and laying out HTML is
 * the browser's own work. Each block is therefore a real frame positioned
 * through the same view every object is placed by, so it pans, zooms and
 * rotates with everything else while the layout engine does the rendering.
 *
 * Two consequences worth knowing. A block is *magnified* rather than relaid
 * out when the view zooms — its size is stated in canvas units and the view's
 * magnification is a transform — so a card that is 400 wide stays 400 wide and
 * simply gets bigger, as it would in any design tool. And the whole layer
 * ignores the pointer, so clicking a block selects and drags the object
 * beneath it exactly as clicking a shader does.
 */

export interface HtmlLayerProps {
  readonly document: CanvasDocument;
  readonly viewport: ViewportState;
  /** The block being worked inside, which takes the pointer and is editable. */
  readonly editingId?: string | null;
  /** Called with what a block's markup now is, after it has been edited. */
  readonly onEdited?: (objectId: string, html: string) => void;
}

/** The properties a drag changes about where a block is, and how big. */
const DRAGGED = ['x', 'y', 'width', 'height', 'rotation'] as const;
type Dragged = (typeof DRAGGED)[number];

function isDragged(key: string): key is Dragged {
  return (DRAGGED as readonly string[]).includes(key);
}

export function HtmlLayer({ document, viewport, editingId, onEdited }: HtmlLayerProps) {
  /** Each block's frame, so the one being edited can be told to become so. */
  const frames = useRef(new Map<string, HTMLIFrameElement>());

  /**
   * What each block is currently rendering, and what its own page last
   * reported back.
   *
   * Setting a frame's document reloads it. An edit made *inside* the page
   * therefore cannot be written straight back out: the object would change,
   * the frame would reload, and the caret, the scroll position and the edit
   * itself would all be thrown away as it did. So an edit that came from the
   * page leaves the page alone, and only a change from somewhere else — the
   * panel, an undo, a different block — rebuilds it.
   */
  const rendered = useRef(new Map<string, { html: string; css: string }>());
  const reported = useRef(new Map<string, string>());

  // Written to the frames rather than rendered as an attribute, so that what
  // reloads a page is a decision taken here rather than a consequence of React
  // re-rendering for any reason at all.
  useEffect(() => {
    // Blocks that have left the document take their bookkeeping with them.
    const live = new Set(document.objects.filter(isHtmlObject).map((object) => object.id));
    for (const held of [frames.current, rendered.current, reported.current]) {
      for (const objectId of [...held.keys()]) {
        if (!live.has(objectId)) held.delete(objectId);
      }
    }

    for (const object of document.objects) {
      if (!isHtmlObject(object)) continue;

      const frame = frames.current.get(object.id);
      if (!frame) continue;

      const last = rendered.current.get(object.id);
      const unchanged = last && last.css === object.css && last.html === object.html;
      const fromThePage = object.html === reported.current.get(object.id);
      if (unchanged || fromThePage) continue;

      rendered.current.set(object.id, { html: object.html, css: object.css });
      frame.srcdoc = documentFor(object.html, object.css);
    }
  }, [document]);

  // Editing happens inside the block: the frame is sandboxed without
  // same-origin access, so nothing here can reach into the page. The two talk
  // instead — this asks, the agent inside answers.
  useEffect(() => {
    for (const [objectId, frame] of frames.current) {
      const editing = objectId === editingId;
      frame.contentWindow?.postMessage({ kind: EDIT_MESSAGE, editing }, '*');

      // The page can put the caret in itself, but only the embedder can hand
      // the keyboard to the frame: without this, typing after entering a block
      // goes to the canvas, which reads it as shortcuts.
      if (editing) frame.focus();
    }
  }, [editingId, document]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const data = event.data as { kind?: string; html?: string } | null;
      if (!data) return;

      // Only the frame it actually came from, so one block's edits cannot be
      // written into another's markup.
      for (const [objectId, frame] of frames.current) {
        if (frame.contentWindow !== event.source) continue;

        if (data.kind === READY_MESSAGE) {
          frame.contentWindow?.postMessage(
            { kind: EDIT_MESSAGE, editing: objectId === editingId },
            '*',
          );
        }

        if (data.kind === HTML_MESSAGE && typeof data.html === 'string') {
          reported.current.set(objectId, data.html);
          onEdited?.(objectId, data.html);
        }
      }
    };

    window.addEventListener('message', listener);
    return () => {
      window.removeEventListener('message', listener);
    };
  }, [onEdited, editingId]);

  /**
   * What a drag currently has, which never reaches the document until it ends.
   *
   * Without this a block sits still while its selection outline moves with the
   * pointer, and only catches up when the drag is let go — the object and the
   * thing being dragged visibly disagree for the whole gesture.
   */
  const [dragging, setDragging] = useState<readonly TransientEdit[]>([]);
  useEffect(() => transientChannel.subscribe(setDragging), []);

  const dragged = (objectId: string): Partial<Record<Dragged, number>> => {
    const changes: Partial<Record<Dragged, number>> = {};
    for (const edit of dragging) {
      if (edit.objectId !== objectId || !isDragged(edit.key)) continue;
      if (typeof edit.value === 'number') changes[edit.key] = edit.value;
    }
    return changes;
  };

  const blocks = document.objects.filter(
    (object) =>
      isHtmlObject(object) &&
      object.visible &&
      !ancestorsOf(document, object.id).some((parent) => !parent.visible),
  );

  if (blocks.length === 0) return null;

  return (
    <div className={styles.layer}>
      {blocks.map((object) => {
        if (!isHtmlObject(object)) return null;

        // A drag states what it changes the way the object stores it, which
        // for something inside a container is relative to that container — so
        // it is applied before the containers are composed in, not after.
        const live = dragged(object.id);
        const placement = absolutePlacement(
          document,
          Object.keys(live).length === 0 ? object : { ...object, ...live },
        );
        // Rotation is about the object's centre, as it is everywhere else, so
        // the block is composed centre-first: to the origin, magnified,
        // turned, then out to where its centre belongs on screen.
        const centre = canvasToScreen(
          { x: placement.x + placement.width / 2, y: placement.y + placement.height / 2 },
          viewport,
        );

        return (
          <iframe
            className={object.id === editingId ? styles.blockEditing : styles.block}
            key={object.id}
            ref={(element) => {
              // Nothing is forgotten when this is called with null. React
              // re-runs a ref callback whenever its identity changes — which
              // for one written inline is every render — and clearing here
              // threw away, on every keystroke, the record of what each page
              // had reported.
              if (!element) return;

              frames.current.set(object.id, element);
              // Its first page, set here for the same reason as every later
              // one: the frame reloads when this changes, and when that
              // happens is not React's decision to make.
              if (!rendered.current.has(object.id)) {
                rendered.current.set(object.id, { html: object.html, css: object.css });
                element.srcdoc = documentFor(object.html, object.css);
              }
            }}
            // No same-origin: scripts in pasted markup may run, and may not
            // reach this application, its storage, or the document.
            sandbox="allow-scripts"
            style={{
              width: `${String(placement.width)}px`,
              height: `${String(placement.height)}px`,
              transform: [
                `translate(${String(centre.x)}px, ${String(centre.y)}px)`,
                `rotate(${String(placement.rotation)}rad)`,
                `scale(${String(viewport.zoom)})`,
                `translate(${String(-placement.width / 2)}px, ${String(-placement.height / 2)}px)`,
              ].join(' '),
              opacity: object.opacity,
            }}
            title={object.name}
          />
        );
      })}
    </div>
  );
}
