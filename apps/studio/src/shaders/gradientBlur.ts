import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from '@shader/core';

/**
 * A soft two-colour gradient with an animated warp.
 *
 * Deliberately simple: it exists to prove the pipeline end to end while the
 * mesh gradient port is still ahead. Note that it is entirely data — no
 * interface code — and that it reads `vUv` rather than screen coordinates.
 */
export const gradientBlurManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'gradient-blur',
  name: 'Soft gradient',
  category: 'Gradients',
  description: 'A two-colour gradient with a slow animated warp.',

  fragmentSource: `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 uv = vUv;

  // Warp the sampling position so the gradient drifts rather than sliding.
  float t = uTime * speed;
  vec2 warped = uv + vec2(
    noise(uv * 3.0 + vec2(t * 0.3, 0.0)) - 0.5,
    noise(uv * 3.0 + vec2(0.0, t * 0.25)) - 0.5
  ) * warp;

  float angleRadians = radians(angle);
  vec2 axis = vec2(cos(angleRadians), sin(angleRadians));
  float g = clamp(dot(warped - 0.5, axis) + 0.5, 0.0, 1.0);

  g = pow(g, max(contrast, 0.001));

  vec3 color = mix(colorA, colorB, g);

  // A gentle vignette keeps the edges from reading as a hard cut.
  float edge = smoothstep(0.0, vignette + 0.001, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
  color = mix(color * 0.82, color, edge);

  outColor = vec4(color, 1.0);
}
`,

  parameters: [
    {
      name: 'colorA',
      label: 'Start colour',
      type: 'color',
      group: 'Colour',
      defaultValue: '#4d7cff',
    },
    {
      name: 'colorB',
      label: 'End colour',
      type: 'color',
      group: 'Colour',
      defaultValue: '#ff5da2',
    },
    {
      name: 'angle',
      label: 'Angle',
      type: 'number',
      group: 'Colour',
      defaultValue: 45,
      min: 0,
      max: 360,
      step: 1,
    },
    {
      name: 'contrast',
      label: 'Contrast',
      type: 'number',
      group: 'Colour',
      defaultValue: 1,
      min: 0.2,
      max: 4,
      step: 0.01,
    },
    {
      name: 'warp',
      label: 'Warp',
      type: 'number',
      group: 'Motion',
      defaultValue: 0.35,
      min: 0,
      max: 1.5,
      step: 0.01,
    },
    {
      name: 'speed',
      label: 'Speed',
      type: 'number',
      group: 'Motion',
      defaultValue: 0.4,
      min: 0,
      max: 3,
      step: 0.01,
    },
    {
      name: 'vignette',
      label: 'Edge softness',
      type: 'number',
      group: 'Finish',
      defaultValue: 0.12,
      min: 0,
      max: 0.5,
      step: 0.005,
    },
  ],

  presets: [
    { id: 'default', name: 'Cobalt', values: {} },
    {
      id: 'ember',
      name: 'Ember',
      values: { colorA: '#ff8a3d', colorB: '#c81d5a', angle: 120, warp: 0.6 },
    },
    {
      id: 'mint',
      name: 'Mint',
      values: { colorA: '#2de3a7', colorB: '#0b5f8a', angle: 210, contrast: 1.6, speed: 0.2 },
    },
    {
      id: 'still',
      name: 'Still',
      values: { colorA: '#e8e8ea', colorB: '#4a4a55', warp: 0, speed: 0 },
    },
  ],
};
