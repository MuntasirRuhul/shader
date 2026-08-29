import type { ShaderManifest, ShaderPreset } from '@shader/core';
import styles from './ShaderLibrary.module.css';

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

/**
 * A cheap preview built from the preset's colour values. Rendering each card
 * with a real shader would mean a context per card; a gradient of its actual
 * colours conveys the same thing for nothing.
 */
function swatchFor(manifest: ShaderManifest, preset: ShaderPreset): string {
  const colors = manifest.parameters
    .filter((parameter) => parameter.type === 'color')
    .map((parameter) => {
      const value = preset.values[parameter.name];
      return typeof value === 'string' ? value : parameter.defaultValue;
    });

  if (colors.length === 0) return 'var(--sb-control-track)';
  if (colors.length === 1) return colors[0] ?? 'var(--sb-control-track)';
  return `linear-gradient(135deg, ${colors.join(', ')})`;
}
