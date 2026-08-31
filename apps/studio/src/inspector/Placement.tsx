import type { CanvasObject, ObjectChanges } from '@shader/core';
import { NumberField } from '@shader/design-system';
import { useEditorStore } from '../store/editorStore';
import styles from './Placement.module.css';

/**
 * Where an object is and how big it is, as numbers.
 *
 * Dragging a handle is the fast way to size something and a hopeless way to
 * size it *precisely* — and it cannot size anything larger than the part of
 * the canvas currently on screen, since the drag ends at the window's edge.
 * A page three thousand pixels tall was simply not reachable.
 *
 * The position is stated the way the object stores it, which for something
 * inside a frame or a group is relative to that container: what is typed here
 * and what a drag produces are then the same numbers.
 */

export interface PlacementProps {
  readonly object: CanvasObject;
}

/** Nothing may be sized to nothing: a zero-width object cannot be grabbed again. */
const MIN_SIZE = 1;

/** Well past any canvas anybody is building, and short of where floats get coarse. */
const MAX_SIZE = 100000;

export function Placement({ object }: PlacementProps) {
  const set = (changes: ObjectChanges, label: string) => {
    useEditorStore.getState().updateObject(object.id, changes, label);
  };

  const degrees = Math.round((object.rotation * 180) / Math.PI);

  return (
    <section className={styles.placement}>
      <h3 className={styles.title}>Size and position</h3>

      <div className={styles.pair}>
        <div className={styles.labelled}>
          <span className={styles.fieldLabel}>X</span>
          <NumberField
            label="X position"
            max={MAX_SIZE}
            min={-MAX_SIZE}
            onValueChange={(x) => {
              set({ x }, 'Move');
            }}
            step={1}
            value={Math.round(object.x)}
          />
        </div>

        <div className={styles.labelled}>
          <span className={styles.fieldLabel}>Y</span>
          <NumberField
            label="Y position"
            max={MAX_SIZE}
            min={-MAX_SIZE}
            onValueChange={(y) => {
              set({ y }, 'Move');
            }}
            step={1}
            value={Math.round(object.y)}
          />
        </div>
      </div>

      <div className={styles.pair}>
        <div className={styles.labelled}>
          <span className={styles.fieldLabel}>Width</span>
          <NumberField
            label="Width"
            max={MAX_SIZE}
            min={MIN_SIZE}
            onValueChange={(width) => {
              set({ width }, 'Resize');
            }}
            step={1}
            value={Math.round(object.width)}
          />
        </div>

        <div className={styles.labelled}>
          <span className={styles.fieldLabel}>Height</span>
          <NumberField
            label="Height"
            max={MAX_SIZE}
            min={MIN_SIZE}
            onValueChange={(height) => {
              set({ height }, 'Resize');
            }}
            step={1}
            value={Math.round(object.height)}
          />
        </div>
      </div>

      <div className={styles.pair}>
        <div className={styles.labelled}>
          <span className={styles.fieldLabel}>Rotation</span>
          <NumberField
            label="Rotation"
            max={360}
            min={-360}
            onValueChange={(next) => {
              set({ rotation: (next * Math.PI) / 180 }, 'Rotate');
            }}
            step={1}
            value={degrees}
          />
        </div>
      </div>
    </section>
  );
}
