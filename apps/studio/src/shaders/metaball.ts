import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from '@shader/core';
import { createMetaballAdvance, MAX_BALLS, METABALL_INITIAL_STATE } from './metaballSimulation';

/**
 * The metaball field, ported from the `metaball-shader-control` experiment.
 *
 * Each ball contributes to every pixel, weighted by distance, and the colours
 * are averaged in OKLab. Where two balls meet they merge into one form rather
 * than overlapping, which is what makes the shape read as liquid.
 *
 * Three things about this port are deliberate.
 *
 * It reads `vUv` rather than the fragment's position on the drawing surface,
 * because an object is a transformed quad that screen coordinates cannot
 * address.
 *
 * The balls are not authored. Their positions, sizes, and weights are
 * simulation state: the source experiment moved them from JavaScript every
 * frame, and the controls it offers — Count, Size, Blur, Magnet, Speed —
 * govern that motion, not a list of balls. An earlier port had no place to put
 * the simulation, so it shipped a still image with per-ball editing the source
 * never had; this one does not.
 *
 * It declares no transform controls. The source's Scale, Rotate, X, and Y were
 * its stand-in for placing the effect on a page. Here the object has a
 * transform of its own, and the shader fills whatever the object is.
 */

export const metaballManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'metaball',
  name: 'Metaball',
  category: 'Fields',
  description: 'Drifting colour fields that merge where they meet, blended in OKLab.',

  fragmentSource: `
float srgb2lin(float c){ return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float lin2srgb(float c){ return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
vec3 srgb2lin3(vec3 c){ return vec3(srgb2lin(c.r), srgb2lin(c.g), srgb2lin(c.b)); }
vec3 lin2srgb3(vec3 c){ return vec3(lin2srgb(c.r), lin2srgb(c.g), lin2srgb(c.b)); }
float cbrtSigned(float x){ return sign(x) * pow(abs(x), 1.0 / 3.0); }

vec3 rgb2oklab(vec3 c){
  vec3 lc = srgb2lin3(c);
  float l = cbrtSigned(0.4122214708 * lc.r + 0.5363325363 * lc.g + 0.0514459929 * lc.b);
  float m = cbrtSigned(0.2119034982 * lc.r + 0.6806995451 * lc.g + 0.1073969566 * lc.b);
  float s = cbrtSigned(0.0883024619 * lc.r + 0.2817188376 * lc.g + 0.6299787005 * lc.b);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  );
}

vec3 oklab2rgb(vec3 c){
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  vec3 lin = vec3(
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
  return clamp(lin2srgb3(lin), 0.0, 1.0);
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);

  float F = 0.0;
  vec3 labSum = vec3(0.0);

  // Blur lowers the falloff exponent, so a ball reaches further before it
  // fades — and it widens the alpha transition at the end by the same amount.
  float edgeExp = mix(4.0, 1.15, blur);

  // Positions, radii, colours, and weights are all simulation state: the
  // shader draws where the balls are, and never decides where that is.
  for (int i = 0; i < ${String(MAX_BALLS)}; i++) {
    if (i >= balls_count) break;
    vec2 c = vec2((balls_position[i].x - 0.5) * aspect, balls_position[i].y - 0.5);
    float d = length(p - c);
    float r = max(balls_radius[i], 0.001);
    // Flat near the centre, smooth at the edge, and never hard-clipped.
    float field = balls_weight[i] / (1.0 + pow(d / r, edgeExp));
    F += field;
    labSum += field * rgb2oklab(balls_color[i]);
  }

  vec3 blended = F > 0.0008 ? oklab2rgb(labSum / F) : background;

  float aMin = mix(0.09, 0.015, blur);
  float aMax = mix(0.60, 0.95, blur);
  float alpha = smoothstep(aMin, aMax, F);

  outColor = vec4(mix(background, blended, alpha), 1.0);
}
`,

  /**
   * The balls the program draws. Nothing here is editable — the state schema
   * exists so the runtime knows how to bind what the simulation returns, which
   * it does through exactly the packing a repeatable group of parameters uses.
   */
  simulation: {
    schema: [
      {
        name: 'balls',
        label: 'Ball',
        type: 'group',
        maxEntries: MAX_BALLS,
        entryParameters: [
          { name: 'color', label: 'Colour', type: 'color', defaultValue: '#ffffff' },
          {
            name: 'position',
            label: 'Position',
            type: 'vector2',
            defaultValue: { x: 0.5, y: 0.5 },
            min: { x: -0.5, y: -0.5 },
            max: { x: 1.5, y: 1.5 },
            step: 0.001,
          },
          {
            name: 'radius',
            label: 'Radius',
            type: 'number',
            defaultValue: 0.06,
            min: 0,
            max: 1,
            step: 0.001,
          },
          {
            name: 'weight',
            label: 'Weight',
            type: 'number',
            defaultValue: 1,
            min: 0,
            max: 1,
            step: 0.001,
          },
        ],
        defaultEntries: [],
      },
    ],
    initial: METABALL_INITIAL_STATE,
    advance: createMetaballAdvance(),
  },

  parameters: [
    {
      name: 'ballCount',
      label: 'Count',
      type: 'number',
      group: 'Effect',
      description: 'How many balls drift in the field.',
      defaultValue: 10,
      min: 1,
      max: MAX_BALLS,
      step: 1,
      integer: true,
    },
    {
      name: 'size',
      label: 'Size',
      type: 'number',
      group: 'Effect',
      description: 'The base radius each ball varies around.',
      defaultValue: 0.06,
      min: 0.02,
      max: 0.2,
      step: 0.01,
    },
    {
      name: 'blur',
      label: 'Blur',
      type: 'number',
      group: 'Effect',
      description: 'How far each ball reaches, and how gently the field fades out.',
      defaultValue: 0,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      name: 'magnet',
      label: 'Magnet',
      type: 'number',
      group: 'Effect',
      description: 'How strongly the balls pull toward one another and merge.',
      defaultValue: 0,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      name: 'speed',
      label: 'Speed',
      type: 'number',
      group: 'Motion',
      description: 'The rate of the whole simulation. At zero the field holds still.',
      defaultValue: 1,
      min: 0,
      max: 3,
      step: 0.1,
    },
    {
      name: 'palette',
      label: 'Colour',
      type: 'group',
      group: 'Colour',
      description: 'The pool the balls take their colours from, in turn.',
      maxEntries: 8,
      minEntries: 1,
      entryParameters: [{ name: 'color', label: 'Colour', type: 'color', defaultValue: '#4d7cff' }],
      defaultEntries: [
        { color: '#ff3377' },
        { color: '#ff9900' },
        { color: '#ffdd00' },
        { color: '#0080ff' },
      ],
    },
    {
      name: 'background',
      label: 'Background',
      type: 'color',
      group: 'Colour',
      defaultValue: '#000000',
    },
  ],

  presets: [
    { id: 'default', name: 'Drift', values: {} },
    {
      id: 'merge',
      name: 'Merge',
      values: {
        ballCount: 5,
        size: 0.14,
        blur: 0.55,
        magnet: 0.7,
        speed: 0.8,
        palette: [{ color: '#ff3377' }, { color: '#0080ff' }],
      },
    },
    {
      id: 'swarm',
      name: 'Swarm',
      values: {
        ballCount: 20,
        size: 0.04,
        blur: 0.2,
        magnet: 0.15,
        speed: 2,
        palette: [
          { color: '#ff3377' },
          { color: '#ff9900' },
          { color: '#ffd166' },
          { color: '#0080ff' },
          { color: '#7a5cff' },
          { color: '#2de3a7' },
        ],
      },
    },
    {
      id: 'ink',
      name: 'Ink',
      values: {
        ballCount: 6,
        size: 0.12,
        blur: 0.8,
        magnet: 0.3,
        speed: 0.5,
        palette: [{ color: '#e8e8ea' }, { color: '#9b9ba3' }],
        background: '#18181c',
      },
    },
  ],
};
