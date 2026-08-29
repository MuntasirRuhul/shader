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
 * A cheap preview built from the preset's colour values.
 *
 * Rendering each card with a real shader would mean a WebGL context per card.
 * A gradient of the colours the preset actually uses conveys the same thing
 * for nothing — including colours inside a repeatable group, which is where a
 * mesh gradient keeps them.
 */
function swatchFor(manifest: ShaderManifest, preset: ShaderPreset): string {
  const colors = collectColors(manifest, preset);

  if (colors.length === 0) return 'var(--sb-control-track)';
  if (colors.length === 1) return colors[0] ?? 'var(--sb-control-track)';
  return `linear-gradient(135deg, ${colors.join(', ')})`;
}

function collectColors(manifest: ShaderManifest, preset: ShaderPreset): string[] {
  const colors: string[] = [];

  for (const parameter of manifest.parameters) {
    if (parameter.type === 'color') {
      // The background is what the poles sit on, not part of the blend.
      if (parameter.name === 'background') continue;
      const value = preset.values[parameter.name];
      colors.push(typeof value === 'string' ? value : parameter.defaultValue);
      continue;
    }

    if (parameter.type !== 'group') continue;

    const entries = preset.values[parameter.name] ?? parameter.defaultEntries;
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      for (const entryParameter of parameter.entryParameters) {
        if (entryParameter.type !== 'color') continue;
        const value = (entry as Record<string, unknown>)[entryParameter.name];
        colors.push(typeof value === 'string' ? value : entryParameter.defaultValue);
      }
    }
  }

  return colors;
}
