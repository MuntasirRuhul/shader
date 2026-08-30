import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from '@shader/core';

/**
 * The contour ribbon, ported from the `Ribbon` experiment.
 *
 * A drifting metaball field is sliced into contour bands and coloured from a
 * palette, so the bands read as a folded ribbon rather than as blobs. A glass
 * lens over the middle refracts the field where it passes beneath.
 *
 * The source is written in device pixels and takes a device pixel ratio
 * uniform. That cannot come across: the runtime already renders at the device
 * ratio, so a shader compensating for it again would double-apply the scaling,
 * and the same document would look different on a denser display — the exact
 * coupling object-local coordinates exist to remove. Every length here is a
 * fraction of the object instead, which is also what lets the lens stay
 * centred when the object is resized.
 *
 * The source also kept two clocks, advancing one by the drift speed and the
 * other by the flow speed. Both are derived from the single elapsed time the
 * runtime supplies.
 */

const MAX_STOPS = 8;
const MAX_BLOBS = 8;

export const ribbonManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'ribbon',
  name: 'Ribbon',
  category: 'Fields',
  description: 'A drifting field sliced into coloured contour bands, seen through glass.',

  fragmentSource: `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  // Quintic fade: the second derivative is continuous too, so the warped
  // domain shows no faint creases along cell boundaries.
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash(i), hash(i + vec2(1, 0)), f.x),
    mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x),
    f.y
  );
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return v;
}

float sdRoundBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

/* The lens half-extents, as a fraction of the object rather than in pixels. */
vec2 lensHalf(float aspect){
  return vec2(glassWidth * aspect * 0.5, glassHeight * 0.5);
}

/*
 * A shallow dome, not a frosted blur: flat at the centre and bending hardest
 * at the rim, the way light grazes the edge of a real lens. The bend follows
 * the rounded rectangle's own outward normal, taken as a numeric gradient of
 * its distance field, so straight edges and rounded corners behave alike.
 */
vec2 glassDisplace(vec2 p, float aspect){
  if (glassBend <= 0.0001) return vec2(0.0);

  vec2 half_ = lensHalf(aspect);
  float corner = glassCorner * min(half_.x, half_.y);
  vec2 b = half_ - corner;

  float d = sdRoundBox(p, b, corner);
  if (d > 0.01) return vec2(0.0);

  float eps = 0.004;
  float dx = sdRoundBox(p + vec2(eps, 0.0), b, corner) - sdRoundBox(p - vec2(eps, 0.0), b, corner);
  float dy = sdRoundBox(p + vec2(0.0, eps), b, corner) - sdRoundBox(p - vec2(0.0, eps), b, corner);
  vec2 grad = vec2(dx, dy) / (2.0 * eps);

  float depth = clamp(-d / max(min(half_.x, half_.y), 0.001), 0.0, 1.0);
  float bend = pow(1.0 - depth, 1.6);
  float inside = smoothstep(0.01, -0.03, d);

  return grad * bend * inside * glassBend * 0.16;
}

/* The drifting metaball field the contours are drawn from. */
float field(vec2 p, float t, float ft){
  vec2 travel = vec2(0.0);
  if (flowDirection == 1) travel = vec2(0.0, 1.0);
  else if (flowDirection == 2) travel = vec2(0.0, -1.0);
  else if (flowDirection == 3) travel = vec2(1.0, 0.0);
  else if (flowDirection == 4) travel = vec2(-1.0, 0.0);

  // Domain warp, so the ribbon undulates instead of reading as circles.
  vec2 q = vec2(fbm(p * 1.2 + t * 0.10), fbm(p * 1.2 + vec2(4.3, 1.7) - t * 0.08));
  p += (q - 0.5) * warp * 3.0;

  float f = 0.0;
  float n = float(blobs);
  float span = 3.2;

  for (int i = 0; i < ${String(MAX_BLOBS)}; i++) {
    if (i >= blobs) break;
    float fi = float(i);
    float spread = (fi / max(n - 1.0, 1.0)) * 2.0 - 1.0;
    vec2 c = vec2(
      spread * 1.6 + sin(t * (0.11 + 0.03 * fi) + fi * 1.7) * 0.25,
      sin(t * (0.19 + 0.05 * fi) + fi * 2.3) * 0.42
    );

    // Staggered wrap: each blob carries its own share of the travel span, so
    // as one leaves the far edge another is already entering.
    if (flowDirection != 0) {
      c += travel * (ft * 0.30 + (fi / n) * span);
      if (travel.y != 0.0) c.y = mod(c.y + span * 0.5, span) - span * 0.5;
      if (travel.x != 0.0) c.x = mod(c.x + span * 0.5, span) - span * 0.5;
    }

    vec2 d = p - c;
    f += (radius * radius) / (dot(d, d) + 0.02);
  }

  return f;
}

/* Maps a field value onto the palette's contour bands. */
vec4 contour(float v, float offset){
  int n = max(stops_count, 1);
  float total = bandWidth * float(n);
  float t = (v - level - offset) / max(total, 1e-4);

  // Coverage comes from the raw value, colour from a clamped one, so a fading
  // edge blends toward the background instead of through a dark halo. Written
  // as 1.0 - smoothstep(0.94, 1.0, t) because GLSL leaves smoothstep undefined
  // when its first edge is the larger, and t is unbounded here.
  float edgeFade = min(smoothstep(0.0, 0.06, t), 1.0 - smoothstep(0.94, 1.0, t));
  float tc = clamp(t, 0.0, 1.0);

  float f = tc * float(n);
  int idx = int(floor(f)) % n; if (idx < 0) idx += n;
  float frac = fract(f);
  int iPrev = (idx + n - 1) % n, iNext = (idx + 1) % n;

  vec3 c = stops_color[0], cP = stops_color[0], cN = stops_color[0];
  for (int i = 0; i < ${String(MAX_STOPS)}; i++) {
    if (i == idx) c = stops_color[i];
    if (i == iPrev) cP = stops_color[i];
    if (i == iNext) cN = stops_color[i];
  }

  // A seam blend centred on the boundary and symmetric either side. A
  // one-sided ramp reaches the next colour exactly at the seam and then resets
  // flat, so the gradient's slope jumps there and reads as a crease.
  float w = clamp(softness * 10.0, 0.0, 1.0) * 0.5;
  if (w > 1e-4) {
    if (frac > 1.0 - w) c = mix(c, cN, 0.5 * smoothstep(1.0 - w, 1.0, frac));
    else if (frac < w) c = mix(cP, c, 0.5 + 0.5 * smoothstep(0.0, w, frac));
  }

  return vec4(c, edgeFade);
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 uv = (vUv - 0.5) * vec2(aspect, 1.0);
  uv /= max(scale, 0.01);

  // Bend the sampling point, not the pixel: the field is procedural, so
  // seeing it refracted just means evaluating it somewhere else.
  vec2 lensPoint = (vUv - 0.5) * vec2(aspect, 1.0);
  uv += glassDisplace(lensPoint, aspect) / max(scale, 0.01);

  float t = uTime * speed;
  float ft = uTime * flowSpeed;
  float v = field(uv, t, ft);

  // Chromatic dispersion: sample the contour at slightly different levels per
  // channel, so band edges carry a faint colour fringe.
  vec4 cr = contour(v, -shift);
  vec4 cg = contour(v, 0.0);
  vec4 cb = contour(v, shift);

  vec3 band = vec3(cr.r, cg.g, cb.b);
  float cover = max(cr.a, max(cg.a, cb.a));

  vec3 col = mix(background, band, cover);

  if (glow > 0.0001) {
    float halo = smoothstep(0.0, 1.0, v / max(level, 0.001)) * (1.0 - cover);
    col += band * halo * glow * 0.35;
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,

  parameters: [
    {
      name: 'stops',
      label: 'Stop',
      type: 'group',
      group: 'Palette',
      description: 'The field is sliced into bands and coloured from these, in order.',
      maxEntries: MAX_STOPS,
      minEntries: 1,
      entryParameters: [{ name: 'color', label: 'Colour', type: 'color', defaultValue: '#4d7cff' }],
      defaultEntries: [
        { color: '#ff5da2' },
        { color: '#ff8a3d' },
        { color: '#ffd166' },
        { color: '#2de3a7' },
        { color: '#4d7cff' },
      ],
    },
    {
      name: 'background',
      label: 'Background',
      type: 'color',
      group: 'Palette',
      defaultValue: '#08080c',
    },
    {
      name: 'bandWidth',
      label: 'Band width',
      type: 'number',
      group: 'Bands',
      defaultValue: 0.16,
      min: 0.01,
      max: 1,
      step: 0.005,
    },
    {
      name: 'level',
      label: 'Level',
      type: 'number',
      group: 'Bands',
      description: 'Which contour of the field the first band sits on.',
      defaultValue: 1.6,
      min: 0.1,
      max: 6,
      step: 0.01,
    },
    {
      name: 'softness',
      label: 'Seam softness',
      type: 'number',
      group: 'Bands',
      description: 'Zero gives crisp plates; higher blends each band into the next.',
      defaultValue: 0.02,
      min: 0,
      max: 0.1,
      step: 0.001,
    },
    {
      name: 'shift',
      label: 'Dispersion',
      type: 'number',
      group: 'Bands',
      description: 'Offsets the bands per colour channel, fringing their edges.',
      defaultValue: 0.02,
      min: 0,
      max: 0.3,
      step: 0.001,
    },
    {
      name: 'glow',
      label: 'Glow',
      type: 'number',
      group: 'Bands',
      defaultValue: 0,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      name: 'blobs',
      label: 'Blobs',
      type: 'number',
      group: 'Field',
      integer: true,
      defaultValue: 6,
      min: 1,
      max: MAX_BLOBS,
      step: 1,
    },
    {
      name: 'radius',
      label: 'Blob radius',
      type: 'number',
      group: 'Field',
      defaultValue: 0.3,
      min: 0.02,
      max: 1,
      step: 0.01,
    },
    {
      name: 'warp',
      label: 'Warp',
      type: 'number',
      group: 'Field',
      defaultValue: 0.35,
      min: 0,
      max: 2,
      step: 0.01,
    },
    {
      name: 'scale',
      label: 'Scale',
      type: 'number',
      group: 'Field',
      defaultValue: 1,
      min: 0.1,
      max: 4,
      step: 0.01,
    },
    {
      name: 'speed',
      label: 'Drift speed',
      type: 'number',
      group: 'Motion',
      defaultValue: 0.4,
      min: 0,
      max: 3,
      step: 0.01,
    },
    {
      name: 'flowDirection',
      label: 'Flow',
      type: 'enum',
      group: 'Motion',
      defaultValue: 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'up', label: 'Upward' },
        { value: 'down', label: 'Downward' },
        { value: 'right', label: 'Rightward' },
        { value: 'left', label: 'Leftward' },
      ],
    },
    {
      name: 'flowSpeed',
      label: 'Flow speed',
      type: 'number',
      group: 'Motion',
      defaultValue: 0.3,
      min: 0,
      max: 3,
      step: 0.01,
    },
    {
      name: 'glassWidth',
      label: 'Lens width',
      type: 'number',
      group: 'Glass',
      description: 'A fraction of the object, so the lens keeps its place when resized.',
      defaultValue: 0.62,
      min: 0.05,
      max: 1,
      step: 0.01,
    },
    {
      name: 'glassHeight',
      label: 'Lens height',
      type: 'number',
      group: 'Glass',
      defaultValue: 0.44,
      min: 0.05,
      max: 1,
      step: 0.01,
    },
    {
      name: 'glassCorner',
      label: 'Lens corner',
      type: 'number',
      group: 'Glass',
      defaultValue: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      name: 'glassBend',
      label: 'Refraction',
      type: 'number',
      group: 'Glass',
      description: 'Zero leaves the field undistorted and costs nothing.',
      defaultValue: 0.7,
      min: 0,
      max: 2,
      step: 0.01,
    },
  ],

  presets: [
    { id: 'default', name: 'Spectrum', values: {} },
    {
      id: 'plates',
      name: 'Plates',
      values: {
        stops: [{ color: '#0b5f8a' }, { color: '#2de3a7' }, { color: '#e8e8ea' }],
        softness: 0,
        bandWidth: 0.22,
        glow: 0,
        glassBend: 0,
        warp: 0.15,
      },
    },
    {
      id: 'aurora',
      name: 'Aurora',
      values: {
        stops: [{ color: '#7a5cff' }, { color: '#2de3a7' }, { color: '#4d7cff' }],
        softness: 0.06,
        glow: 0.9,
        warp: 0.8,
        flowDirection: 'up',
        flowSpeed: 0.5,
        background: '#04040a',
      },
    },
    {
      id: 'ember',
      name: 'Ember',
      values: {
        stops: [{ color: '#ff3d3d' }, { color: '#ff8a3d' }, { color: '#ffd166' }],
        level: 2.2,
        bandWidth: 0.12,
        shift: 0.05,
        glow: 0.5,
        background: '#12060a',
      },
    },
  ],
};
