import {
  buildModelMatrix,
  declareUniforms,
  IDENTITY_VIEWPORT,
  RESERVED_UNIFORMS,
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

/**
 * Every group a shader declares, whether the user edits it or the simulation
 * fills it. Both bind through the same uniform arrays.
 */
function groupsOf(manifest: ShaderManifest) {
  return [...manifest.parameters, ...(manifest.simulation?.schema ?? [])].filter(isGroupParameter);
}

/** The fixed array size a shader's GLSL allocates for a named group. */
function allocatedSize(manifest: ShaderManifest, groupName: string): number | undefined {
  // The runtime declares `name_entry[N]`; the shader must loop to the same N.
  const declaration = new RegExp(`${groupName}_\\w+\\[(\\d+)\\]`).exec(
    declareUniforms(groupsOf(manifest)),
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
    groupsOf(manifest).map((group) => ({
      id: `${manifest.id}:${group.name}`,
      manifest,
      group,
    })),
  );

  /**
   * The groups the program indexes. A group a shader declares only to drive
   * its simulation — a colour pool the advance picks from — is bound and read
   * in JavaScript, and there is no array in the GLSL for it to disagree with.
   */
  const readByProgram = withGroups.filter(({ manifest, group }) =>
    manifest.fragmentSource.includes(`${group.name}_`),
  );

  it('there is at least one group to check', () => {
    expect(withGroups.length).toBeGreaterThan(0);
    expect(readByProgram.length).toBeGreaterThan(0);
  });

  it.each(readByProgram)('$id declares the size its GLSL allocates', ({ manifest, group }) => {
    expect(allocatedSize(manifest, group.name)).toBe(group.maxEntries);
  });

  it.each(readByProgram)('$id loops to that same size', ({ manifest, group }) => {
    // A loop bound that disagrees with the array silently drops entries.
    const bound = new RegExp(`i\\s*<\\s*${String(group.maxEntries)}\\b`);
    expect(manifest.fragmentSource).toMatch(bound);
  });

  it.each(readByProgram)('$id reads the count the runtime supplies', ({ manifest, group }) => {
    expect(manifest.fragmentSource).toContain(`${group.name}_count`);
  });

  const editable = catalogue.flatMap((manifest) =>
    manifest.parameters.filter(isGroupParameter).map((group) => ({
      id: `${manifest.id}:${group.name}`,
      manifest,
      group,
    })),
  );

  it.each(editable)('$id has no parameter counting its entries', ({ manifest, group }) => {
    // The list the user edits is the only thing that says how many entries
    // there are. A parameter claiming the same would be a second source of
    // truth, editable to disagree with the list itself.
    //
    // A group the simulation fills is different: nobody edits it, and the
    // parameter driving how many entries it has is the source of truth.
    const singular = group.name.replace(/s$/, '');
    const counters = new Set(['count', `${group.name}count`, `${singular}count`]);
    const declared = manifest.parameters.map((parameter) => parameter.name.toLowerCase());

    expect(declared.filter((name) => counters.has(name))).toEqual([]);
  });
});

describe('a shader that declares neither state nor passes', () => {
  // The migration for every existing shader was to do nothing, and this is
  // what says so: only the metaball took up either capability.
  const unchanged = catalogue.filter((manifest) => manifest.id !== 'metaball');

  it('is most of the catalogue', () => {
    expect(unchanged.length).toBeGreaterThan(1);
  });

  it.each(unchanged)('$id owns no state', (manifest) => {
    expect(manifest.simulation).toBeUndefined();
  });

  it.each(unchanged)('$id declares no passes', (manifest) => {
    expect(manifest.passes).toBeUndefined();
  });

  it('leaves the metaball as the one shader using them', () => {
    const metaball = registry.get('metaball');

    expect(metaball?.simulation).toBeDefined();
    expect(metaball?.passes).toBeUndefined();
  });
});

describe('the library listing', () => {
  it('offers exactly one entry per shader', () => {
    const entries = offered.map((manifest) => manifest.id);

    expect(entries.length).toBe(offered.length);
    expect(new Set(entries).size).toBe(entries.length);
  });

  it('labels each entry with a name unique in the listing', () => {
    // Preset names collide across shaders — "Ember" belongs to three. Shader
    // names are what the listing shows, so those are what must be distinct.
    const names = offered.map((manifest) => manifest.name);

    expect(new Set(names).size, `duplicate names: ${names.join(', ')}`).toBe(names.length);
  });

  it('gives every listed shader a preset to apply', () => {
    for (const manifest of offered) {
      expect(manifest.presets[0], `${manifest.id} has no first preset`).toBeDefined();
    }
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
  // An entry previews the shader's first preset, which is what choosing it applies.
  const entries = offered.map((manifest) => ({
    id: manifest.id,
    manifest,
    preset: manifest.presets[0]!,
  }));

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

describe('no shipped shader knows the view exists', () => {
  // The view is the runtime's business. A shader that read it would behave
  // differently depending on where it happened to be looked at from, which is
  // the coupling `vUv` exists to remove.
  it.each(catalogue)('$id reads no viewport, pan, or zoom', (manifest) => {
    const sources = [
      manifest.fragmentSource,
      ...(manifest.passes ?? []).map((pass) => pass.fragmentSource),
    ].join('\n');

    expect(sources).not.toMatch(/\bu_?viewport\b/i);
    expect(sources).not.toMatch(/\bu_?pan\b/i);
    expect(sources).not.toMatch(/\bu_?zoom\b/i);
  });

  it('places an object identically with the identity view and with none', () => {
    // The migration, stated as an equality: supplying the identity view is
    // exactly what the runtime did before views existed.
    const transform = { x: 140, y: 90, width: 320, height: 200, rotation: 0.35 };

    const before = buildModelMatrix(transform, 1200, 800);
    const after = buildModelMatrix(transform, 1200, 800, IDENTITY_VIEWPORT);

    expect([...after]).toEqual([...before]);
  });

  it('offers a shader nothing about the view to read', () => {
    // Pinned as a whole so a uniform cannot be added without saying so here:
    // every one of these is about the object, and none about where it is being
    // looked at from.
    expect(Object.values(RESERVED_UNIFORMS).sort()).toEqual([
      'uHasImage',
      'uHasMask',
      'uImage',
      'uMask',
      'uOpacity',
      'uResolution',
      'uTime',
    ]);
  });
});
