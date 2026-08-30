import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from '@shader/core';

/**
 * The metaball field, ported from the `metaball-shader-control` experiment.
 *
 * Each ball contributes to every pixel, weighted by distance, and the colours
 * are averaged in OKLab. Where two balls meet they merge into one form rather
 * than overlapping, which is what makes the shape read as liquid.
 *
 * Two things about this port are deliberate.
 *
 * It reads `vUv` rather than the fragment's position on the drawing surface,
 * because an object is a transformed quad that screen coordinates cannot
 * address.
 *
 * It declares no time and does not move. The source shader has no time
 * uniform: its animation came from the host page rewriting ball positions
 * between frames. Ported faithfully it is a still image, and the runtime will
 * correctly stop drawing it once it has been drawn. Giving it motion here
 * would be new behaviour wearing a port's clothes.
 */

const MAX_BALLS = 24;

export const metaballManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'metaball',
  name: 'Metaball',
  category: 'Fields',
  description: 'Overlapping colour fields that merge where they meet, blended in OKLab.',

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

  // Softness lowers the falloff exponent, so a ball reaches further before it
  // fades — and it widens the alpha transition at the end by the same amount.
  float edgeExp = mix(4.0, 1.15, softness);

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

  float aMin = mix(0.09, 0.015, softness);
  float aMax = mix(0.60, 0.95, softness);
  float alpha = smoothstep(aMin, aMax, F);

  outColor = vec4(mix(background, blended, alpha), 1.0);
}
`,

  parameters: [
    {
      name: 'balls',
      label: 'Ball',
      type: 'group',
      group: 'Field',
      description: 'Every ball contributes to every pixel, weighted by distance.',
      maxEntries: MAX_BALLS,
      minEntries: 1,
      entryParameters: [
        { name: 'color', label: 'Colour', type: 'color', defaultValue: '#4d7cff' },
        {
          name: 'position',
          label: 'Position',
          type: 'vector2',
          defaultValue: { x: 0.5, y: 0.5 },
          min: { x: -0.5, y: -0.5 },
          max: { x: 1.5, y: 1.5 },
          step: 0.01,
        },
        {
          name: 'radius',
          label: 'Radius',
          type: 'number',
          defaultValue: 0.14,
          min: 0.01,
          max: 1,
          step: 0.005,
        },
        {
          name: 'weight',
          label: 'Weight',
          type: 'number',
          description: 'How strongly this ball pulls the merged colour toward its own.',
          defaultValue: 1,
          min: 0,
          max: 3,
          step: 0.01,
        },
      ],
      defaultEntries: [
        { color: '#ff3377', position: { x: 0.34, y: 0.4 }, radius: 0.17, weight: 1 },
        { color: '#ff9900', position: { x: 0.58, y: 0.32 }, radius: 0.14, weight: 1 },
        { color: '#0080ff', position: { x: 0.48, y: 0.62 }, radius: 0.16, weight: 1 },
      ],
    },
    {
      name: 'background',
      label: 'Background',
      type: 'color',
      group: 'Field',
      defaultValue: '#0f0f12',
    },
    {
      name: 'softness',
      label: 'Softness',
      type: 'number',
      group: 'Field',
      description: 'How far each ball reaches, and how gently the field fades out.',
      defaultValue: 0,
      min: 0,
      max: 1,
      step: 0.01,
    },
  ],

  presets: [
    { id: 'default', name: 'Trio', values: {} },
    {
      id: 'merge',
      name: 'Merge',
      values: {
        balls: [
          { color: '#ff3377', position: { x: 0.4, y: 0.5 }, radius: 0.24, weight: 1 },
          { color: '#0080ff', position: { x: 0.6, y: 0.5 }, radius: 0.24, weight: 1 },
        ],
        softness: 0.55,
      },
    },
    {
      id: 'swarm',
      name: 'Swarm',
      values: {
        balls: [
          { color: '#ff3377', position: { x: 0.24, y: 0.3 }, radius: 0.1, weight: 1 },
          { color: '#ff9900', position: { x: 0.44, y: 0.22 }, radius: 0.08, weight: 1 },
          { color: '#ffd166', position: { x: 0.68, y: 0.3 }, radius: 0.09, weight: 1 },
          { color: '#0080ff', position: { x: 0.76, y: 0.55 }, radius: 0.1, weight: 1 },
          { color: '#7a5cff', position: { x: 0.56, y: 0.72 }, radius: 0.11, weight: 1 },
          { color: '#2de3a7', position: { x: 0.3, y: 0.66 }, radius: 0.09, weight: 1 },
        ],
        softness: 0.2,
      },
    },
    {
      id: 'ink',
      name: 'Ink',
      values: {
        balls: [
          { color: '#e8e8ea', position: { x: 0.42, y: 0.44 }, radius: 0.2, weight: 1 },
          { color: '#9b9ba3', position: { x: 0.62, y: 0.6 }, radius: 0.16, weight: 0.7 },
        ],
        background: '#18181c',
        softness: 0.8,
      },
    },
  ],
};
