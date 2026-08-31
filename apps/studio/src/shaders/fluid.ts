import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from '@shader/core';
import { advanceFluid, FLUID_INITIAL_STATE } from './fluidSimulation';

/**
 * Ink in water, ported from the `fluid-mvp` experiment.
 *
 * This is a real fluid solve, not a picture of one: velocity is advected,
 * pressure is relaxed until the flow is incompressible, vorticity is fed back
 * so the swirl does not smooth itself away, and the ink is carried by the
 * field that comes out. Push it and the ink goes where the water goes.
 *
 * Four things about this port are deliberate.
 *
 * The solve is coarse and the ink is fine. Velocity, pressure and their
 * intermediates run at a quarter of the object, the ink at a half, and only
 * the last pass is full size — the cost of a solve is quadratic in resolution,
 * and what the eye reads is the ink, not the field pushing it. The source made
 * the same trade with a 128 grid and a 512 dye buffer.
 *
 * The fields are float. A velocity is signed and runs to the hundreds, a
 * pressure swings either side of zero, and ink is brighter than white before
 * it is tone-mapped: all three are nonsense in eight bits.
 *
 * The pressure solve is twenty relaxations, declared once and repeated rather
 * than written out twenty times. The source exposed that count as a slider;
 * here it is fixed, because the number of passes a shader runs is part of what
 * the shader is, not a value bound into it.
 *
 * It stirs itself. The source was a hero behind a headline and was black until
 * the visitor moved; an object on a canvas has to show what it is, so a slow
 * idle flow is a parameter — set it to zero for the source's behaviour.
 */

/** The relaxations the pressure field is given each frame. */
const PRESSURE_ITERATIONS = 20;

/** The fraction of the object the solve runs at, and the ink is carried at. */
const SOLVE_SCALE = 0.25;
const INK_SCALE = 0.5;

/** Reading a field's own texel size, wherever a pass needs its neighbours. */
const TEXEL = `
vec2 texelOf(sampler2D field) {
  return 1.0 / vec2(textureSize(field, 0));
}
`;

/** The rotation in the flow: what a paddle dropped in the water would spin at. */
const CURL_SOURCE = `${TEXEL}
void main() {
  vec2 texel = texelOf(uVelocity);
  float top = texture(uVelocity, vUv + vec2(0.0, texel.y)).x;
  float bottom = texture(uVelocity, vUv - vec2(0.0, texel.y)).x;
  float left = texture(uVelocity, vUv - vec2(texel.x, 0.0)).y;
  float right = texture(uVelocity, vUv + vec2(texel.x, 0.0)).y;

  outColor = vec4(0.5 * ((right - left) - (top - bottom)), 0.0, 0.0, 1.0);
}
`;

/**
 * Vorticity confinement: the swirl put back.
 *
 * A grid this coarse loses rotation to its own averaging every frame, and
 * fluid without rotation reads as smoke, not water. This pushes each parcel
 * back towards the spin it had.
 */
const VORTICITY_SOURCE = `${TEXEL}
void main() {
  vec2 texel = texelOf(uCurl);
  float left = texture(uCurl, vUv - vec2(texel.x, 0.0)).x;
  float right = texture(uCurl, vUv + vec2(texel.x, 0.0)).x;
  float top = texture(uCurl, vUv + vec2(0.0, texel.y)).x;
  float bottom = texture(uCurl, vUv - vec2(0.0, texel.y)).x;
  float here = texture(uCurl, vUv).x;

  vec2 force = 0.5 * vec2(abs(top) - abs(bottom), abs(right) - abs(left));
  force /= length(force) + 1e-4;
  force *= vorticity * activity * here;
  force.y *= -1.0;

  vec2 velocity = texture(uVelocity, vUv).xy + force * dt;
  outColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0);
}
`;

/** How much the flow is piling up or thinning out at each point. */
const DIVERGENCE_SOURCE = `${TEXEL}
void main() {
  vec2 texel = texelOf(uVorticity);
  float left = texture(uVorticity, vUv - vec2(texel.x, 0.0)).x;
  float right = texture(uVorticity, vUv + vec2(texel.x, 0.0)).x;
  float top = texture(uVorticity, vUv + vec2(0.0, texel.y)).y;
  float bottom = texture(uVorticity, vUv - vec2(0.0, texel.y)).y;

  outColor = vec4(0.5 * (right - left + top - bottom), 0.0, 0.0, 1.0);
}
`;

/**
 * One relaxation of the pressure field, run twenty times a frame.
 *
 * Each run reads what the last one wrote, which is what makes it converge; the
 * field also carries over between frames, because last frame's answer is most
 * of this frame's. It decays once at the start of the frame so a stale
 * solution cannot accumulate — and only at the start, which is what
 * `uIteration` is for.
 */
const PRESSURE_SOURCE = `${TEXEL}
void main() {
  vec2 texel = texelOf(uPressure);
  float decay = uIteration == 0 ? 0.8 : 1.0;

  float left = texture(uPressure, vUv - vec2(texel.x, 0.0)).x * decay;
  float right = texture(uPressure, vUv + vec2(texel.x, 0.0)).x * decay;
  float top = texture(uPressure, vUv + vec2(0.0, texel.y)).x * decay;
  float bottom = texture(uPressure, vUv - vec2(0.0, texel.y)).x * decay;
  float divergence = texture(uDivergence, vUv).x;

  outColor = vec4((left + right + top + bottom - divergence) * 0.25, 0.0, 0.0, 1.0);
}
`;

/**
 * The velocity the next frame starts from: projected, carried along itself,
 * and pushed wherever the pointer pushed.
 *
 * Subtracting the pressure gradient is what makes the flow incompressible, and
 * it is done inside the lookup rather than in a pass of its own so that
 * advection carries the corrected field rather than the one before it.
 */
const VELOCITY_SOURCE = `${TEXEL}
vec2 projected(vec2 uv) {
  vec2 texel = texelOf(uPressure);
  float left = texture(uPressure, uv - vec2(texel.x, 0.0)).x;
  float right = texture(uPressure, uv + vec2(texel.x, 0.0)).x;
  float top = texture(uPressure, uv + vec2(0.0, texel.y)).x;
  float bottom = texture(uPressure, uv - vec2(0.0, texel.y)).x;

  return texture(uVorticity, uv).xy - 0.5 * vec2(right - left, top - bottom);
}

void main() {
  vec2 texel = texelOf(uVorticity);
  vec2 velocity = projected(vUv);

  // Semi-Lagrangian: what is here now is what was upstream a moment ago.
  vec2 came = vUv - dt * velocity * texel;
  // The water holds its push while it is being pushed and settles when it is
  // not, so a stroke travels but nothing drifts for ever afterwards.
  vec2 carried = projected(came) * (0.965 + 0.0335 * activity);

  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 offset = vUv - splatPoint;
  offset.x *= aspect;
  carried += exp(-dot(offset, offset) / splatRadius) * splatForce;

  outColor = vec4(carried, 0.0, 1.0);
}
`;

/** The ink: carried by the flow, spreading as it goes, and topped up where it is dropped. */
const INK_SOURCE = `${TEXEL}
void main() {
  vec2 texel = texelOf(uInk);
  vec2 velocity = texture(uVelocity, vUv).xy;
  vec2 came = vUv - dt * velocity * texel;

  vec3 here = texture(uInk, came).rgb;
  // Ink in water does not keep its edge. It spreads faster once the water is
  // calm, which is what turns a stroke into a cloud rather than a line.
  vec3 around = texture(uInk, came + vec2(texel.x, 0.0)).rgb
    + texture(uInk, came - vec2(texel.x, 0.0)).rgb
    + texture(uInk, came + vec2(0.0, texel.y)).rgb
    + texture(uInk, came - vec2(0.0, texel.y)).rgb;
  vec3 spread = mix(here, around * 0.25, 0.04 + 0.10 * (1.0 - activity));

  vec3 carried = spread * dissipation;

  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 offset = vUv - dyePoint;
  offset.x *= aspect;
  float blob = exp(-dot(offset, offset) / (splatRadius * 1.4));
  carried += blob * dyeColor * dyeStrength * dyeAmount * 1.6;

  outColor = vec4(carried, 1.0);
}
`;

/** What reaches the object: the ink, softened and tone-mapped. */
const DISPLAY_SOURCE = `${TEXEL}
void main() {
  vec2 texel = texelOf(uInk);

  vec3 colour = texture(uInk, vUv).rgb * 0.4;
  colour += texture(uInk, vUv + vec2(texel.x, 0.0)).rgb * 0.15;
  colour += texture(uInk, vUv - vec2(texel.x, 0.0)).rgb * 0.15;
  colour += texture(uInk, vUv + vec2(0.0, texel.y)).rgb * 0.15;
  colour += texture(uInk, vUv - vec2(0.0, texel.y)).rgb * 0.15;

  // Brightness is rolled off and the hue is left alone: tone-mapping the three
  // channels separately would pull every bright stroke towards white.
  float luminance = dot(colour, vec3(0.299, 0.587, 0.114));
  float rolled = luminance / (1.0 + luminance);
  vec3 mapped = luminance > 1e-4 ? colour * (rolled / luminance) : colour;
  mapped *= 1.9;

  if (showWater) {
    outColor = vec4(background + mapped, 1.0);
    return;
  }

  // No water: only the ink is drawn, so the object can sit over something.
  outColor = vec4(mapped, clamp(rolled * 1.9, 0.0, 1.0));
}
`;

export const fluidManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'fluid',
  name: 'Fluid ink',
  category: 'Fields',
  description: 'Ink pushed through water by a real fluid solve, and by your cursor.',

  // A manifest declares one fragment source, and for a shader drawn in passes
  // the one that reaches the object is the last of them.
  fragmentSource: DISPLAY_SOURCE,

  passes: [
    {
      name: 'curl',
      fragmentSource: CURL_SOURCE,
      reads: [{ uniform: 'uVelocity', pass: 'velocity', previousFrame: true }],
      precision: 'float',
      scale: SOLVE_SCALE,
    },
    {
      name: 'vorticity',
      fragmentSource: VORTICITY_SOURCE,
      reads: [
        { uniform: 'uVelocity', pass: 'velocity', previousFrame: true },
        { uniform: 'uCurl', pass: 'curl' },
      ],
      precision: 'float',
      scale: SOLVE_SCALE,
    },
    {
      name: 'divergence',
      fragmentSource: DIVERGENCE_SOURCE,
      reads: [{ uniform: 'uVorticity', pass: 'vorticity' }],
      precision: 'float',
      scale: SOLVE_SCALE,
    },
    {
      name: 'pressure',
      fragmentSource: PRESSURE_SOURCE,
      reads: [
        { uniform: 'uPressure', pass: 'pressure', previousFrame: true },
        { uniform: 'uDivergence', pass: 'divergence' },
      ],
      precision: 'float',
      scale: SOLVE_SCALE,
      iterations: PRESSURE_ITERATIONS,
    },
    {
      name: 'velocity',
      fragmentSource: VELOCITY_SOURCE,
      reads: [
        { uniform: 'uPressure', pass: 'pressure' },
        { uniform: 'uVorticity', pass: 'vorticity' },
      ],
      precision: 'float',
      scale: SOLVE_SCALE,
    },
    {
      name: 'ink',
      fragmentSource: INK_SOURCE,
      reads: [
        { uniform: 'uVelocity', pass: 'velocity' },
        { uniform: 'uInk', pass: 'ink', previousFrame: true },
      ],
      precision: 'float',
      scale: INK_SCALE,
    },
    {
      name: 'display',
      fragmentSource: DISPLAY_SOURCE,
      reads: [{ uniform: 'uInk', pass: 'ink' }],
    },
  ],

  /**
   * What the pointer is doing to the water. Nothing here is editable: the user
   * pushes it by moving over it, and sets how hard through the parameters.
   */
  simulation: {
    schema: [
      {
        name: 'dt',
        label: 'Step',
        type: 'number',
        defaultValue: 0.016,
        min: 0,
        max: 1,
        step: 0.001,
      },
      {
        name: 'activity',
        label: 'Activity',
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.001,
      },
      {
        name: 'splatPoint',
        label: 'Push at',
        type: 'vector2',
        defaultValue: { x: 0.5, y: 0.5 },
        min: { x: -1, y: -1 },
        max: { x: 2, y: 2 },
        step: 0.001,
      },
      {
        name: 'splatForce',
        label: 'Push',
        type: 'vector2',
        defaultValue: { x: 0, y: 0 },
        min: { x: -10000, y: -10000 },
        max: { x: 10000, y: 10000 },
        step: 0.001,
      },
      {
        name: 'dyePoint',
        label: 'Ink at',
        type: 'vector2',
        defaultValue: { x: 0.5, y: 0.5 },
        min: { x: -1, y: -1 },
        max: { x: 2, y: 2 },
        step: 0.001,
      },
      { name: 'dyeColor', label: 'Ink colour', type: 'color', defaultValue: '#2b3cff' },
      {
        name: 'dyeStrength',
        label: 'Ink amount',
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.001,
      },
    ],
    initial: FLUID_INITIAL_STATE,
    advance: advanceFluid,
  },

  parameters: [
    {
      name: 'ink1',
      label: 'First ink',
      type: 'color',
      group: 'Ink',
      defaultValue: '#2b3cff',
    },
    { name: 'ink2', label: 'Second ink', type: 'color', group: 'Ink', defaultValue: '#00b3ff' },
    { name: 'ink3', label: 'Third ink', type: 'color', group: 'Ink', defaultValue: '#a24bff' },
    {
      name: 'dyeAmount',
      label: 'Ink amount',
      type: 'number',
      group: 'Ink',
      description: 'How much ink each push drops into the water.',
      defaultValue: 0.55,
      min: 0.1,
      max: 1,
      step: 0.01,
    },
    {
      name: 'dissipation',
      label: 'Dissipation',
      type: 'number',
      group: 'Ink',
      description: 'How much ink survives each frame. Lower clears the water sooner.',
      defaultValue: 0.98,
      min: 0.9,
      max: 1,
      step: 0.001,
    },
    {
      name: 'force',
      label: 'Force',
      type: 'number',
      group: 'Flow',
      description: 'How hard a movement pushes the water.',
      defaultValue: 0.55,
      min: 0.1,
      max: 1,
      step: 0.01,
    },
    {
      name: 'vorticity',
      label: 'Vorticity',
      type: 'number',
      group: 'Flow',
      description: 'How much swirl is put back into a flow that would smooth itself away.',
      defaultValue: 22,
      min: 0,
      max: 50,
      step: 1,
    },
    {
      name: 'splatRadius',
      label: 'Puff size',
      type: 'number',
      group: 'Flow',
      description: 'The size of each push, and of the ink dropped with it.',
      defaultValue: 0.0012,
      min: 0.0002,
      max: 0.004,
      step: 0.0001,
    },
    {
      name: 'idleFlow',
      label: 'Idle flow',
      type: 'number',
      group: 'Flow',
      description: 'How much the water stirs itself when nobody is pushing it. Zero waits.',
      defaultValue: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      name: 'background',
      label: 'Water',
      type: 'color',
      group: 'Surface',
      defaultValue: '#000000',
    },
    {
      name: 'showWater',
      label: 'Show the water',
      type: 'boolean',
      group: 'Surface',
      description: 'Off draws only the ink, so the object sits over whatever is beneath it.',
      defaultValue: true,
    },
  ],

  presets: [
    { id: 'default', name: 'Ink', values: {} },
    {
      id: 'storm',
      name: 'Storm',
      values: {
        force: 0.9,
        vorticity: 44,
        dyeAmount: 0.8,
        dissipation: 0.99,
        idleFlow: 0.7,
        splatRadius: 0.002,
      },
    },
    {
      id: 'still',
      name: 'Still water',
      values: { idleFlow: 0, vorticity: 12, force: 0.35, dissipation: 0.96 },
    },
    {
      id: 'ember',
      name: 'Ember',
      values: {
        ink1: '#ff5a1f',
        ink2: '#ffb703',
        ink3: '#ff2d55',
        background: '#120806',
        vorticity: 30,
        dissipation: 0.985,
      },
    },
  ],
};
