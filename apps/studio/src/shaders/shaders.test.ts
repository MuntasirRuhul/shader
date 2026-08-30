import {
  declareUniforms,
  isGroupParameter,
  resolvePreset,
  SOLID_FILL_SHADER_ID,
  validateManifest,
  type ShaderManifest,
} from '@shader/core';
import { describe, expect, it } from 'vitest';
import { swatchFor } from '../panels/swatch';
import { libraryShaders, registry } from './registry';

/**
 * The catalogue's own contract.
 *
 * Every case here reads the registry rather than a written-out list, so a
 * shader added later is covered the moment it is registered — which is the
 * point: the rules a port has to meet should not themselves need editing
 * each time somebody ports something.
 */
const catalogue = registry.list();
const offered = libraryShaders();

/** The fixed array size a shader's GLSL allocates for a named group. */
function allocatedSize(manifest: ShaderManifest, groupName: string): number | undefined {
  // The runtime declares `name_entry[N]`; the shader must loop to the same N.
  const declaration = new RegExp(`${groupName}_\\w+\\[(\\d+)\\]`).exec(
    declareUniforms(manifest.parameters),
  );
  return declaration?.[1] === undefined ? undefined : Number(declaration[1]);
}

describe('every shader in the catalogue', () => {
  it('has at least one to test', () => {
    expect(catalogue.length).toBeGreaterThan(0);
  });

  it.each(catalogue)('$id passes manifest validation', (manifest) => {
    expect(validateManifest(manifest)).toEqual([]);
  });

  it.each(catalogue)('$id declares at least one preset', (manifest) => {
    expect(manifest.presets.length).toBeGreaterThan(0);
  });

  it.each(catalogue)('$id resolves every preset to a complete value set', (manifest) => {
    for (const preset of manifest.presets) {
      const resolved = resolvePreset(manifest, preset.id);
      for (const parameter of manifest.parameters) {
        expect(
          resolved[parameter.name],
          `${manifest.id}:${preset.id} left ${parameter.name} unresolved`,
        ).toBeDefined();
      }
    }
  });

  it.each(catalogue)('$id addresses its object, not the drawing surface', (manifest) => {
    // An object is a transformed quad; screen coordinates cannot say which
    // rectangle a shader is meant to fill.
    expect(manifest.fragmentSource).not.toContain('gl_FragCoord');
  });

  it.each(catalogue)('$id does not read a device pixel ratio', (manifest) => {
    // The runtime already renders at the device ratio. A shader compensating
    // again would double-apply it and render differently per display.
    expect(manifest.fragmentSource).not.toMatch(/\bu_?dpr\b/i);
  });
});

describe('a repeatable group matches what its shader allocates', () => {
  const withGroups = catalogue.flatMap((manifest) =>
    manifest.parameters.filter(isGroupParameter).map((group) => ({
      id: `${manifest.id}:${group.name}`,
      manifest,
      group,
    })),
  );

  it('there is at least one group to check', () => {
    expect(withGroups.length).toBeGreaterThan(0);
  });

  it.each(withGroups)('$id declares the size its GLSL allocates', ({ manifest, group }) => {
    expect(allocatedSize(manifest, group.name)).toBe(group.maxEntries);
  });

  it.each(withGroups)('$id loops to that same size', ({ manifest, group }) => {
    // A loop bound that disagrees with the array silently drops entries.
    const bound = new RegExp(`i\\s*<\\s*${String(group.maxEntries)}\\b`);
    expect(manifest.fragmentSource).toMatch(bound);
  });

  it.each(withGroups)('$id reads the count the runtime supplies', ({ manifest, group }) => {
    expect(manifest.fragmentSource).toContain(`${group.name}_count`);
  });

  it.each(withGroups)('$id declares no count parameter of its own', ({ manifest }) => {
    // A declared count would be a second source of truth for how many
    // entries exist, and editable to disagree with the list itself.
    const names = manifest.parameters.map((parameter) => parameter.name.toLowerCase());
    expect(names).not.toContain('count');
    expect(names).not.toContain('stopcount');
  });
});

describe('the library listing', () => {
  it('offers an entry for every preset of every shader it lists', () => {
    const entries = offered.flatMap((manifest) =>
      manifest.presets.map((preset) => `${manifest.id}:${preset.id}`),
    );

    expect(entries.length).toBe(
      offered.reduce((total, manifest) => total + manifest.presets.length, 0),
    );
    expect(new Set(entries).size).toBe(entries.length);
  });

  it('hides shaders that serve the application own rendering', () => {
    expect(offered.map((manifest) => manifest.id)).not.toContain(SOLID_FILL_SHADER_ID);
  });

  it('still resolves a hidden shader for rendering', () => {
    // An object with a plain fill has to be drawn even though nobody picks it.
    expect(registry.get(SOLID_FILL_SHADER_ID)).toBeDefined();
  });

  it('offers every shader that is not a built-in', () => {
    const hidden = catalogue.filter((manifest) => manifest.category === 'Built-in');

    expect(offered.length).toBe(catalogue.length - hidden.length);
  });
});

describe('a library entry previews its colours', () => {
  const entries = offered.flatMap((manifest) =>
    manifest.presets.map((preset) => ({ id: `${manifest.id}:${preset.id}`, manifest, preset })),
  );

  it.each(entries)('$id previews something visible', ({ manifest, preset }) => {
    const preview = swatchFor(manifest, preset);

    expect(preview).toBeTruthy();
    expect(preview).not.toBe('');
  });

  it('builds a preview from colours inside a repeatable group', () => {
    const withGroupColors = offered.find((manifest) =>
      manifest.parameters.some(
        (parameter) =>
          isGroupParameter(parameter) &&
          parameter.entryParameters.some((entry) => entry.type === 'color'),
      ),
    );
    expect(withGroupColors, 'expected a shader keeping colours in a group').toBeDefined();
    if (!withGroupColors) return;

    const preset = withGroupColors.presets[0];
    if (!preset) return;

    expect(swatchFor(withGroupColors, preset)).toMatch(/#[0-9a-f]{6}/i);
  });

  it('excludes a declared background colour from the preview', () => {
    const withBackground = offered.find((manifest) =>
      manifest.parameters.some(
        (parameter) => parameter.name === 'background' && parameter.type === 'color',
      ),
    );
    expect(withBackground, 'expected a shader declaring a background').toBeDefined();
    if (!withBackground) return;

    const background = withBackground.parameters.find(
      (parameter) => parameter.name === 'background',
    );
    const preset = withBackground.presets[0];
    if (!background || background.type !== 'color' || !preset) return;

    const declared = (preset.values['background'] ?? background.defaultValue) as string;
    // The preview shows the subject, not the backdrop it sits on.
    expect(swatchFor(withBackground, preset)).not.toContain(declared);
  });

  it('falls back to a neutral placeholder when a preset carries no colours', () => {
    const colourless: ShaderManifest = {
      schemaVersion: catalogue[0]?.schemaVersion ?? 1,
      id: 'colourless',
      name: 'Colourless',
      category: 'Test',
      fragmentSource: 'void main() { outColor = vec4(vUv, 0.0, 1.0); }',
      parameters: [
        {
          name: 'amount',
          label: 'Amount',
          type: 'number',
          defaultValue: 1,
          min: 0,
          max: 2,
          step: 0.1,
        },
      ],
      presets: [{ id: 'default', name: 'Default', values: {} }],
    };

    expect(swatchFor(colourless, colourless.presets[0]!)).toContain('var(--sb-');
  });
});
