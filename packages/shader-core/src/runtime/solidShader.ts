import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from '../registry/manifest';

/**
 * The shader that draws a solid fill.
 *
 * An object's fill may be a plain colour, and such an object still has to be
 * drawn, in the right place in the stacking order, with the same opacity and
 * masking as everything else. Expressing it as a manifest keeps one rendering
 * path rather than a second, parallel one that would have to be kept in step.
 *
 * It is registered by the runtime rather than shipped as a library shader, so
 * it does not appear as something a user picks.
 */
export const SOLID_FILL_SHADER_ID = '@solid';

export const solidFillManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: SOLID_FILL_SHADER_ID,
  name: 'Solid colour',
  category: 'Built-in',
  description: 'Draws a single colour. Used for objects with a plain fill.',

  fragmentSource: `
void main() {
  outColor = vec4(color, 1.0);
}
`,

  parameters: [
    {
      name: 'color',
      label: 'Colour',
      type: 'color',
      defaultValue: '#4d7cff',
    },
  ],

  presets: [{ id: 'default', name: 'Default', values: {} }],
};
