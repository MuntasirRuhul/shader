import { absolutePlacement, ancestorsOf, isHtmlObject, type CanvasDocument } from '@shader/core';
import { useEffect, useState } from 'react';
import type { ViewportState } from '../store/slices';
import { transientChannel, type TransientEdit } from '../store/transientChannel';
import { documentFor } from './htmlDocument';
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
}

/** The properties a drag changes about where a block is, and how big. */
const DRAGGED = ['x', 'y', 'width', 'height', 'rotation'] as const;
type Dragged = (typeof DRAGGED)[number];

function isDragged(key: string): key is Dragged {
  return (DRAGGED as readonly string[]).includes(key);
}

export function HtmlLayer({ document, viewport }: HtmlLayerProps) {
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
            className={styles.block}
            key={object.id}
            // No same-origin: scripts in pasted markup may run, and may not
            // reach this application, its storage, or the document.
            sandbox="allow-scripts"
            srcDoc={documentFor(object.html, object.css)}
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
