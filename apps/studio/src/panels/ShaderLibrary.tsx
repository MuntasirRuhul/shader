import type { ShaderManifest, ShaderPreset } from '@shader/core';
import styles from './ShaderLibrary.module.css';
import { swatchFor } from './swatch';

export interface ShaderLibraryProps {
  readonly shaders: readonly ShaderManifest[];
  readonly onChoose: (manifest: ShaderManifest, preset: ShaderPreset) => void;
}

/**
 * The shader list. Each preset is offered as its own card, since a preset is
 * what a user actually recognises and picks.
 */
export function ShaderLibrary({ shaders, onChoose }: ShaderLibraryProps) {
  return (
    <div className={styles.library}>
      <h2 className={styles.heading}>Shaders</h2>
      <ul className={styles.grid}>
        {shaders.flatMap((manifest) =>
          manifest.presets.map((preset) => (
            <li key={`${manifest.id}:${preset.id}`}>
              <button
                className={styles.card}
                onClick={() => {
                  onChoose(manifest, preset);
                }}
                type="button"
              >
                <span
                  className={styles.swatch}
                  style={{ background: swatchFor(manifest, preset) }}
                />
                <span className={styles.label}>{preset.name}</span>
              </button>
            </li>
          )),
        )}
      </ul>
    </div>
  );
}
