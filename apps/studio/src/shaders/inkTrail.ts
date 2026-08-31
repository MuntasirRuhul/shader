import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from '@shader/core';
import { advanceInkTrail, INK_TRAIL_INITIAL_STATE, MAX_BLOBS } from './inkTrailSimulation';

/**
 * The ink trail, ported from the `general builder` prototype — the blob studio
 * that is the closest thing to what this application is meant to feel like.
 *
 * A field of blobs is stamped along the path the ink took, fused where they
 * touch, and then thresholded through an ordered dither, so what reaches the
 * screen is a mass of hard dots rather than a soft gradient. The dither is the
 * point: it is what makes the ink read as print rather than as glow.
 *
 * Three things about this port are deliberate.
 *
 * Only the shader is ported. The prototype is a small builder — text, shapes,
 * layers, an orb — and this application already has those. What was worth
 * taking is the effect.
 *
 * The field is a pass and the dither is a pass. The dither has to threshold a
 * finished field, so it cannot be folded into the same program: a blob still
 * being accumulated has no value to compare against yet.
 *
 * The dot grid is measured in the object's own pixels, not the screen's, so a
 * dot is the same size on any display and grows when the object is magnified —
 * the dither belongs to the object, not to the monitor.
 */

/** The fraction of the object the field is solved at. */
const FIELD_SCALE = 0.5;

/** The blob field: circles along the path, fused where they meet. */
const FIELD_SOURCE = `
/**
 * A smooth maximum. A plain sum saturates the inside of the mass flat and
 * leaves the dither nothing to gradate; this keeps the falloff across the
 * whole radius while still fusing lobes that touch into one form.
 */
float smax(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(a, b, h) + k * h * (1.0 - h);
}

void main() {
  // Blobs are round on the object, so the field is measured in a square space.
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = vec2(vUv.x * aspect, vUv.y);

  float field = 0.0;

  for (int i = 0; i < ${String(MAX_BLOBS)}; i++) {
    if (i >= blobs_count) break;

    float radius = blobs_radius[i];
    if (radius <= 0.0) continue;

    float value = 1.0 - clamp(distance(p, blobs_position[i]) / radius, 0.0, 1.0);
    if (value > 0.0) field = field > 0.0 ? smax(field, value, fuse) : value;
  }

  outColor = vec4(field, 0.0, 0.0, 1.0);
}
`;

/** The dither: one decision per cell, ink or paper. */
const DITHER_SOURCE = `
const float bayer2[4] = float[4](0.0, 2.0, 3.0, 1.0);
const float bayer4[16] = float[16](
  0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0,
  3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0
);
const float bayer8[64] = float[64](
  0.0, 32.0, 8.0, 40.0, 2.0, 34.0, 10.0, 42.0,
  48.0, 16.0, 56.0, 24.0, 50.0, 18.0, 58.0, 26.0,
  12.0, 44.0, 4.0, 36.0, 14.0, 46.0, 6.0, 38.0,
  60.0, 28.0, 52.0, 20.0, 62.0, 30.0, 54.0, 22.0,
  3.0, 35.0, 11.0, 43.0, 1.0, 33.0, 9.0, 41.0,
  51.0, 19.0, 59.0, 27.0, 49.0, 17.0, 57.0, 25.0,
  15.0, 47.0, 7.0, 39.0, 13.0, 45.0, 5.0, 37.0,
  63.0, 31.0, 55.0, 23.0, 61.0, 29.0, 53.0, 21.0
);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

/** The value this cell has to beat to be inked. */
float ditherThreshold(vec2 cell) {
  if (pattern == 0) {
    ivec2 c = ivec2(mod(cell, 2.0));
    return (bayer2[c.y * 2 + c.x] + 0.5) / 4.0;
  }
  if (pattern == 1) {
    ivec2 c = ivec2(mod(cell, 4.0));
    return (bayer4[c.y * 4 + c.x] + 0.5) / 16.0;
  }
  if (pattern == 2) {
    ivec2 c = ivec2(mod(cell, 8.0));
    return (bayer8[c.y * 8 + c.x] + 0.5) / 64.0;
  }
  // A blue-noise-like scatter: white noise walked by the golden ratio, which
  // spreads the values apart instead of clumping them as plain noise does.
  return fract(hash(cell) + 0.61803398875 * (cell.x + cell.y));
}

void main() {
  vec2 cellSize = vec2(max(float(dotSize), 1.0));
  vec2 cell = floor(vUv * uResolution / cellSize);

  // One reading of the field per cell, taken at its centre: sampling per pixel
  // would soften the very edge the dither exists to harden.
  vec2 sampleUv = (cell + 0.5) * cellSize / max(uResolution, vec2(1.0));
  float field = texture(uField, clamp(sampleUv, 0.0, 1.0)).r;

  float coverage = smoothstep(threshold, threshold + softness, field);
  float inked = step(ditherThreshold(cell), coverage);

  if (showPaper) {
    outColor = vec4(mix(paper, ink, inked), 1.0);
    return;
  }

  // No paper: only the ink is drawn, so the object sits over what is beneath.
  outColor = vec4(ink, inked);
}
`;

export const inkTrailManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'ink-trail',
  name: 'Ink trail',
  category: 'Fields',
  description: 'A trail of fused ink blobs, thresholded through an ordered dither.',

  // A manifest declares one fragment source, and for a shader drawn in passes
  // the one that reaches the object is the last of them.
  fragmentSource: DITHER_SOURCE,

  passes: [
    {
      name: 'field',
      fragmentSource: FIELD_SOURCE,
      precision: 'float',
      scale: FIELD_SCALE,
    },
    {
      name: 'dither',
      fragmentSource: DITHER_SOURCE,
      reads: [{ uniform: 'uField', pass: 'field' }],
    },
  ],

  /**
   * The blobs currently on the object. Nothing here is editable: the user
   * draws them by moving over it, and shapes them through the parameters.
   */
  simulation: {
    schema: [
      {
        name: 'blobs',
        label: 'Blob',
        type: 'group',
        maxEntries: MAX_BLOBS,
        entryParameters: [
          {
            name: 'position',
            label: 'Position',
            type: 'vector2',
            defaultValue: { x: 0.5, y: 0.5 },
            min: { x: -2, y: -2 },
            max: { x: 4, y: 4 },
            step: 0.001,
          },
          {
            name: 'radius',
            label: 'Radius',
            type: 'number',
            defaultValue: 0,
            min: 0,
            max: 4,
            step: 0.001,
          },
        ],
        defaultEntries: [],
      },
    ],
    initial: INK_TRAIL_INITIAL_STATE,
    advance: advanceInkTrail,
  },

  parameters: [
    {
      name: 'blobSize',
      label: 'Size',
      type: 'number',
      group: 'Blob',
      description: 'How wide each blob of ink is.',
      defaultValue: 0.14,
      min: 0.01,
      max: 0.26,
      step: 0.005,
    },
    {
      name: 'trailLife',
      label: 'Trail length',
      type: 'number',
      group: 'Blob',
      description: 'Seconds a blob lasts before it has dried away.',
      defaultValue: 1.5,
      min: 0.1,
      max: 4,
      step: 0.1,
    },
    {
      name: 'follow',
      label: 'Follow',
      type: 'number',
      group: 'Blob',
      description: 'How closely the ink keeps up with the cursor. Lower lags further behind.',
      defaultValue: 0.22,
      min: 0.03,
      max: 1,
      step: 0.01,
    },
    {
      name: 'fatten',
      label: 'Fatten',
      type: 'number',
      group: 'Blob',
      description: 'How much a quick stroke thins the ink out.',
      defaultValue: 0.45,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      name: 'drift',
      label: 'Drift',
      type: 'number',
      group: 'Blob',
      description: 'How much the ink draws itself when nobody is drawing. Zero waits.',
      defaultValue: 0.4,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      name: 'threshold',
      label: 'Threshold',
      type: 'number',
      group: 'Surface',
      description: 'The field value the surface of the ink sits at.',
      defaultValue: 0.12,
      min: 0.01,
      max: 0.9,
      step: 0.01,
    },
    {
      name: 'softness',
      label: 'Softness',
      type: 'number',
      group: 'Surface',
      description: 'How far the edge grades from bare paper to solid ink.',
      defaultValue: 1.2,
      min: 0.02,
      max: 2,
      step: 0.02,
    },
    {
      name: 'fuse',
      label: 'Fuse',
      type: 'number',
      group: 'Surface',
      description: 'How readily two blobs that touch become one form.',
      defaultValue: 0.16,
      min: 0.01,
      max: 0.6,
      step: 0.01,
    },
    {
      name: 'breakup',
      label: 'Break-up',
      type: 'number',
      group: 'Surface',
      description: 'How unevenly the tail dries, and so how it breaks into drops.',
      defaultValue: 0.55,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      name: 'pattern',
      label: 'Pattern',
      type: 'enum',
      group: 'Dither',
      defaultValue: 'bayer8',
      options: [
        { value: 'bayer2', label: 'Bayer 2×2' },
        { value: 'bayer4', label: 'Bayer 4×4' },
        { value: 'bayer8', label: 'Bayer 8×8' },
        { value: 'noise', label: 'Blue noise' },
      ],
    },
    {
      name: 'dotSize',
      label: 'Dot size',
      type: 'number',
      group: 'Dither',
      description: 'The size of one dither cell, in the object own pixels.',
      defaultValue: 4,
      min: 1,
      max: 16,
      step: 1,
      integer: true,
    },
    { name: 'ink', label: 'Ink', type: 'color', group: 'Colour', defaultValue: '#f4f4f0' },
    { name: 'paper', label: 'Paper', type: 'color', group: 'Colour', defaultValue: '#111113' },
    {
      name: 'showPaper',
      label: 'Show the paper',
      type: 'boolean',
      group: 'Colour',
      description: 'Off draws only the ink, so the object sits over whatever is beneath it.',
      defaultValue: true,
    },
  ],

  presets: [
    { id: 'default', name: 'Ink', values: {} },
    {
      id: 'newsprint',
      name: 'Newsprint',
      values: {
        ink: '#111113',
        paper: '#f2efe6',
        pattern: 'bayer4',
        dotSize: 6,
        threshold: 0.2,
        softness: 0.9,
        blobSize: 0.18,
      },
    },
    {
      id: 'mercury',
      name: 'Mercury',
      values: {
        ink: '#dfe7ff',
        paper: '#05060a',
        fuse: 0.42,
        threshold: 0.3,
        softness: 0.3,
        breakup: 0.15,
        dotSize: 2,
        pattern: 'bayer8',
      },
    },
    {
      id: 'scatter',
      name: 'Scatter',
      values: {
        pattern: 'noise',
        dotSize: 3,
        breakup: 0.9,
        trailLife: 2.6,
        blobSize: 0.1,
        follow: 0.5,
        fatten: 0.8,
      },
    },
  ],
};
