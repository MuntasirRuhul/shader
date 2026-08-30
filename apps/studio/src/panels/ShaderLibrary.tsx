import type { ShaderManifest, ShaderPreset } from '@shader/core';
import styles from './ShaderLibrary.module.css';
import { swatchFor } from './swatch';

export interface ShaderLibraryProps {
  readonly shaders: readonly ShaderManifest[];
  readonly onChoose: (manifest: ShaderManifest, preset: ShaderPreset) => void;
}

/**
 * The shader list.
 *
 * One entry per shader, because the shader is what a user is choosing. Listing
 * a card per preset instead made four shaders into sixteen entries, several
 * sharing a name, with nothing on the card to say which shader it belonged to.
 * A preset is a starting point within a shader, and is chosen in the parameter
 * panel beside the controls it sets.
 */
export function ShaderLibrary({ shaders, onChoose }: ShaderLibraryProps) {
  return (
    <div className={styles.library}>
      <h2 className={styles.heading}>Shaders</h2>
      <ul className={styles.grid}>
        {shaders.map((manifest) => {
          const first = manifest.presets[0];
          if (!first) return null;

          return (
            <li key={manifest.id}>
              <button
                className={styles.card}
                onClick={() => {
                  onChoose(manifest, first);
                }}
                title={manifest.description ?? manifest.name}
                type="button"
              >
                <span
                  className={styles.swatch}
                  style={{ background: swatchFor(manifest, first) }}
                />
                <span className={styles.label}>{manifest.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
