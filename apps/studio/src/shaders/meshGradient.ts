import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from '@shader/core';

/**
 * The mesh gradient, ported from the `mesh-gradient-hero` experiment.
 *
 * Colour poles are blended by a field-weighted average in OKLab rather than
 * sRGB, which is why two saturated colours meet through a clean transition
 * instead of the grey trough sRGB interpolation produces.
 *
 * Two changes were needed to bring it under the manifest contract:
 *
 * It reads `vUv` instead of `gl_FragCoord.xy / u_resolution.xy`. An object is
 * a transformed quad that may be rotated and may be one of several on screen,
 * so screen coordinates cannot express "fill this rectangle".
 *
 * The poles became a repeatable group. The runtime binds them as fixed-size
 * arrays with a count — `poles_position[]`, `poles_color[]`, `poles_radius[]`,
 * and `poles_count` — which is exactly how the original declared them, so the
 * loop below is unchanged from the experiment.
 */

const MAX_POLES = 8;

export const meshGradientManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'mesh-gradient',
  name: 'Mesh gradient',
  category: 'Gradients',
  description:
    'Colour poles blended through a field-weighted OKLab average, with an animated warp.',

  fragmentSource: `
float srgb2lin(float c){ return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float lin2srgb(float c){ return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
vec3 srgb2lin3(vec3 c){ return vec3(srgb2lin(c.r), srgb2lin(c.g), srgb2lin(c.b)); }
vec3 lin2srgb3(vec3 c){ return vec3(lin2srgb(c.r), lin2srgb(c.g), lin2srgb(c.b)); }
float cbrtSigned(float x){ return sign(x) * pow(abs(x), 1.0 / 3.0); }

// Blending in OKLab keeps two saturated colours from meeting through grey.
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

float nhash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = nhash(i), b = nhash(i + vec2(1., 0.)), c = nhash(i + vec2(0., 1.)), d = nhash(i + vec2(1., 1.));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm2(vec2 p){ return 0.62 * vnoise(p) + 0.31 * vnoise(p * 2.05 + 7.3); }

/*
 * Oscillate, rotate, zig-zag, displace by fBm, then twist radially with a
 * strength that breathes. This is what turns a radially symmetric pole into
 * an elongated organic lobe.
 */
vec2 warpPoint(vec2 p, float t){
  if (warp <= 0.0001) return p;
  float k = warp;
  float sc = max(warpScale, 0.05);

  p += vec2(sin(t * 0.9), cos(t * 1.0)) * 0.06 * k;

  float a = -0.5;
  p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;

  p.x += sin(p.y * 6.0 + t) * 0.15 * k;
  p.y += sin(p.x * 6.0 + t * 0.95) * 0.075 * k;

  float nx = fbm2(vec2(p.x * 3.0, p.y * 7.0) * sc + vec2(t * 0.6, 5.0)) - 0.5;
  float ny = fbm2(vec2(p.x * 3.0, p.y * 7.0) * sc + vec2(0.0, t * 0.6)) - 0.5;
  p += vec2(nx * 2.5, ny * 0.8) * 0.4 * k;

  float tw = (0.5 + sin(t * 0.3) * 0.4) * twist;
  float ang = length(p) * tw;
  p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p;
  return p;
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 uv = vUv;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);

  vec2 wp = warpPoint(p, uTime * speed);

  // Field-weighted average, the metaball model: every pole contributes to
  // every pixel, weighted by how close it is.
  float edgeExp = mix(4.0, 1.15, blur);
  float F = 0.0;
  vec3 labSum = vec3(0.0);

  for (int i = 0; i < ${String(MAX_POLES)}; i++) {
    if (i >= poles_count) break;
    vec2 c = vec2((poles_position[i].x - 0.5) * aspect, poles_position[i].y - 0.5);
    float d = length(wp - c);
    float r = max(poles_radius[i], 0.001);
    float field = 1.0 / (1.0 + pow(d / r, edgeExp));
    F += field;
    labSum += field * rgb2oklab(poles_color[i]);
  }

  vec3 blended = F > 0.0008 ? oklab2rgb(labSum / F) : background;

  float aMin = mix(0.09, 0.015, blur);
  float aMax = mix(0.60, 0.95, blur);
  float alpha = smoothstep(aMin, aMax, F);

  vec3 col = mix(background, blended, alpha);

  // Grain breaks up the banding a smooth gradient shows on an 8-bit display.
  if (grain > 0.0001) {
    float n = nhash(uv * uResolution + uTime);
    col += (n - 0.5) * grain * 0.12;
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,

  parameters: [
    {
      name: 'poles',
      label: 'Pole',
      type: 'group',
      group: 'Colour poles',
      description: 'Every pole contributes to every pixel, weighted by distance.',
      maxEntries: MAX_POLES,
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
          defaultValue: 0.35,
          min: 0.02,
          max: 1.5,
          step: 0.01,
        },
      ],
      defaultEntries: [
        { color: '#ff8a3d', position: { x: 0.25, y: 0.3 }, radius: 0.4 },
        { color: '#c81d5a', position: { x: 0.7, y: 0.35 }, radius: 0.38 },
        { color: '#4d7cff', position: { x: 0.5, y: 0.8 }, radius: 0.42 },
      ],
    },
    {
      name: 'background',
      label: 'Background',
      type: 'color',
      group: 'Colour poles',
      defaultValue: '#0a0a0c',
    },
    {
      name: 'blur',
      label: 'Softness',
      type: 'number',
      group: 'Colour poles',
      description: 'How far each pole reaches before it falls away.',
      defaultValue: 0.62,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      name: 'warp',
      label: 'Warp',
      type: 'number',
      group: 'Motion',
      defaultValue: 0.55,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      name: 'warpScale',
      label: 'Warp scale',
      type: 'number',
      group: 'Motion',
      defaultValue: 1,
      min: 0.05,
      max: 4,
      step: 0.01,
    },
    {
      name: 'twist',
      label: 'Twist',
      type: 'number',
      group: 'Motion',
      defaultValue: 0.7,
      min: 0,
      max: 3,
      step: 0.01,
    },
    {
      name: 'speed',
      label: 'Speed',
      type: 'number',
      group: 'Motion',
      defaultValue: 0.6,
      min: 0,
      max: 3,
      step: 0.01,
    },
    {
      name: 'grain',
      label: 'Grain',
      type: 'number',
      group: 'Finish',
      description: 'Breaks up the banding a smooth gradient shows on an 8-bit display.',
      defaultValue: 0.25,
      min: 0,
      max: 1,
      step: 0.01,
    },
  ],

  presets: [
    { id: 'ember', name: 'Ember', values: {} },
    {
      id: 'full-bleed',
      name: 'Full bleed',
      values: {
        poles: [
          { color: '#5b8cff', position: { x: 0.2, y: 0.2 }, radius: 0.55 },
          { color: '#b76cff', position: { x: 0.8, y: 0.3 }, radius: 0.5 },
          { color: '#ff6cab', position: { x: 0.5, y: 0.85 }, radius: 0.55 },
          { color: '#2de3a7', position: { x: 0.15, y: 0.8 }, radius: 0.4 },
        ],
        blur: 0.8,
        warp: 0.9,
        background: '#10101a',
      },
    },
    {
      id: 'cold',
      name: 'Cold',
      values: {
        poles: [
          { color: '#0b5f8a', position: { x: 0.3, y: 0.25 }, radius: 0.45 },
          { color: '#2de3a7', position: { x: 0.75, y: 0.7 }, radius: 0.4 },
        ],
        blur: 0.5,
        warp: 0.3,
        twist: 0.2,
        background: '#04070d',
      },
    },
    {
      id: 'still',
      name: 'Still',
      values: {
        poles: [
          { color: '#e8e8ea', position: { x: 0.35, y: 0.35 }, radius: 0.5 },
          { color: '#4a4a55', position: { x: 0.7, y: 0.75 }, radius: 0.45 },
        ],
        warp: 0,
        speed: 0,
        twist: 0,
        grain: 0.1,
        background: '#1a1a1f',
      },
    },
  ],
};
