import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from './manifest';
import type { GroupParameter, ShaderParameter } from './parameterSchema';

/** A shader exercising every parameter type, used across the registry tests. */
export const poleGroup: GroupParameter = {
  name: 'poles',
  label: 'Colour poles',
  type: 'group',
  group: 'Colour',
  maxEntries: 4,
  minEntries: 1,
  entryParameters: [
    { name: 'color', label: 'Colour', type: 'color', defaultValue: '#4d7cff' },
    {
      name: 'position',
      label: 'Position',
      type: 'vector2',
      defaultValue: { x: 0.5, y: 0.5 },
      min: { x: 0, y: 0 },
      max: { x: 1, y: 1 },
      step: 0.01,
    },
    {
      name: 'radius',
      label: 'Radius',
      type: 'number',
      defaultValue: 0.4,
      min: 0,
      max: 1,
      step: 0.01,
    },
  ],
  defaultEntries: [{ color: '#ff5722', position: { x: 0.3, y: 0.3 }, radius: 0.5 }],
};

export const sampleParameters: ShaderParameter[] = [
  {
    name: 'speed',
    label: 'Speed',
    type: 'number',
    group: 'Motion',
    defaultValue: 0.5,
    min: 0,
    max: 2,
    step: 0.01,
  },
  { name: 'animate', label: 'Animate', type: 'boolean', group: 'Motion', defaultValue: true },
  {
    name: 'background',
    label: 'Background',
    type: 'color',
    group: 'Colour',
    defaultValue: '#0a0a0b',
  },
  {
    name: 'blendMode',
    label: 'Blend mode',
    type: 'enum',
    group: 'Colour',
    defaultValue: 'normal',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'screen', label: 'Screen' },
    ],
  },
  poleGroup,
];

export const sampleManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'sample',
  name: 'Sample',
  category: 'Gradients',
  fragmentSource: 'void main() { outColor = vec4(vUv, 0.0, 1.0); }',
  parameters: sampleParameters,
  presets: [
    { id: 'default', name: 'Default', values: {} },
    { id: 'fast', name: 'Fast', values: { speed: 1.8 } },
  ],
};

/** A manifest with one field replaced, for testing a specific failure. */
export function manifestWith(overrides: Partial<ShaderManifest>): ShaderManifest {
  return { ...sampleManifest, ...overrides };
}
