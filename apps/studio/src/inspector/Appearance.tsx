import {
  BLEND_MODE_LABELS,
  BLEND_MODES,
  isBlendMode,
  type CanvasObject,
  type ObjectChanges,
} from '@shader/core';
import { NumberField, Select } from '@shader/design-system';
import { useEditorStore } from '../store/editorStore';
import styles from './Appearance.module.css';

/**
 * What is true of an object whatever it is made of.
 *
 * Opacity, how it combines with what is beneath it, and — for a rectangle —
 * how rounded its corners are. Everything here belongs to the object rather
 * than to its fill, which is why changing the fill leaves all of it alone.
 */

export interface AppearanceProps {
  readonly object: CanvasObject;
}

export function Appearance({ object }: AppearanceProps) {
  const set = (changes: ObjectChanges, label: string) => {
    useEditorStore.getState().updateObject(object.id, changes, label);
  };

  return (
    <section className={styles.appearance}>
      <div className={styles.heading}>
        <h3 className={styles.title}>Appearance</h3>
        <button
          aria-label={object.visible ? 'Hide object' : 'Show object'}
          aria-pressed={!object.visible}
          className={styles.iconButton}
          onClick={() => {
            set({ visible: !object.visible }, object.visible ? 'Hide' : 'Show');
          }}
          title={object.visible ? 'Hide' : 'Show'}
          type="button"
        >
          <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
            {object.visible ? (
              <>
                <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4z" />
                <circle cx="8" cy="8" r="1.8" />
              </>
            ) : (
              <>
                <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4z" />
                <path d="M3 13L13 3" />
              </>
            )}
          </svg>
        </button>
      </div>

      <div className={styles.pair}>
        <div className={styles.labelled}>
          <span className={styles.fieldLabel}>Opacity</span>
          <NumberField
            label="Opacity"
            max={100}
            min={0}
            onValueChange={(percent) => {
              set({ opacity: percent / 100 }, 'Change opacity');
            }}
            step={1}
            value={Math.round(object.opacity * 100)}
          />
        </div>

        {object.type === 'rectangle' && (
          <div className={styles.labelled}>
            <span className={styles.fieldLabel}>Corner radius</span>
            <NumberField
              label="Corner radius"
              max={9999}
              min={0}
              onValueChange={(cornerRadius) => {
                set({ cornerRadius }, 'Change corner radius');
              }}
              step={1}
              value={object.cornerRadius}
            />
          </div>
        )}
      </div>

      <div className={styles.labelled}>
        <span className={styles.fieldLabel}>Blend mode</span>
        <Select
          label="Blend mode"
          onValueChange={(chosen) => {
            if (isBlendMode(chosen)) set({ blendMode: chosen }, 'Change blend mode');
          }}
          options={BLEND_MODES.map((mode) => ({ value: mode, label: BLEND_MODE_LABELS[mode] }))}
          value={object.blendMode}
        />
      </div>
    </section>
  );
}
