import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from '@shader/core';
import {
  advanceWaterRipple,
  MAX_RIPPLES,
  WATER_RIPPLE_INITIAL_STATE,
} from './waterRippleSimulation';

/**
 * Water ripple, ported from the `water-ripple-v4` experiment.
 *
 * Rings spread out from wherever the surface was disturbed, and the picture
 * beneath is refracted by the slope of the water rather than merely tinted —
 * which is what makes it read as depth instead of as an overlay.
 *
 * Three things about this port are deliberate.
 *
 * It is the first shader with a picture of its own. The source uploaded a file
 * into a texture the page owned; here the picture is a declared parameter, so
 * the inspector offers a file picker and the document carries what was chosen.
 * With none chosen the water still ripples over its own colours, because an
 * object that draws nothing until a file is found looks broken.
 *
 * The height field is a pass. The source rendered it into a floating-point
 * buffer; a pass target here is eight bits per channel, so the field — which
 * is signed, and whose slope is the whole effect — is packed across two
 * channels and read back with `texelFetch`, which bypasses filtering and so
 * cannot blend two halves of different numbers into a third.
 *
 * It rains. The source only ever rippled under the cursor, which on a page
 * with one canvas is fine; on a canvas of many objects an object that is still
 * until touched reads as broken, so a slow fall of drops is a parameter, and
 * setting it to zero gives the source's behaviour back.
 */

/** The wake, in a field the refraction pass reads the slope of. */
const HEIGHT_SOURCE = `
void main() {
  // Rings are round on the object, so distances are measured in a square
  // space rather than in the object's own stretched one.
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = vec2(vUv.x * aspect, vUv.y);

  float height = 0.0;

  for (int i = 0; i < ${String(MAX_RIPPLES)}; i++) {
    if (i >= ripples_count) break;

    float age = ripples_age[i];
    if (age >= ringLife) continue;

    vec2 centre = vec2(ripples_position[i].x * aspect, ripples_position[i].y);
    float d = distance(p, centre);

    // The ring front travels outward; a short train of crests trails behind it.
    float band = d - age * waveSpeed;
    float wave = sin(band * wavelength) * exp(-abs(band) * falloff);
    float fade = 1.0 - age / ringLife;

    height += ripples_strength[i] * wave * fade * fade * exp(-d * 1.6);
  }

  // Signed, and the target holds eight bits a channel: the top byte goes in
  // red and what is left of it in green, for about sixteen bits in all. The
  // slope of this field is what the next pass draws, and at eight bits the
  // slope is stairs.
  float packed = clamp(height * 0.5 + 0.5, 0.0, 1.0);
  float high = floor(packed * 255.0) / 255.0;
  float low = fract(packed * 255.0);

  outColor = vec4(high, low, 0.0, 1.0);
}
`;

/** The picture, bent by the surface, with a glint where the slope is steep. */
const REFRACT_SOURCE = `
float heightAt(ivec2 texel) {
  ivec2 size = textureSize(uHeight, 0);
  // texelFetch reads one texel exactly. Sampling with filtering would blend
  // the high byte of one texel with the low byte of the next, which decodes
  // to a number the field never held.
  vec4 packed = texelFetch(uHeight, clamp(texel, ivec2(0), size - ivec2(1)), 0);
  return (packed.r + packed.g / 255.0) * 2.0 - 1.0;
}

/**
 * The water itself: what is seen where there is no picture to look through.
 *
 * Shaded by the height as well as bent by its slope, because refracting a
 * smooth gradient through itself changes almost nothing — with no picture the
 * rings have to be visible in the water, or the object looks perfectly still.
 */
vec3 water(vec2 uv, float height) {
  vec3 base = mix(deepColor, surfaceColor, clamp(uv.y, 0.0, 1.0));
  return clamp(base * (1.0 + height * 1.6), 0.0, 1.0);
}

/** Where to sample the picture, given how it is asked to fill the object. */
vec2 fitted(vec2 uv, out bool outside) {
  outside = false;
  if (fit == 2 || source_size.x <= 0.0 || source_size.y <= 0.0) return uv;

  float objectAspect = uResolution.x / max(uResolution.y, 1.0);
  float pictureAspect = source_size.x / source_size.y;
  bool cover = fit == 0;

  vec2 d = uv - 0.5;
  if (objectAspect > pictureAspect) {
    if (cover) d.y *= pictureAspect / objectAspect;
    else d.x *= objectAspect / pictureAspect;
  } else {
    if (cover) d.x *= objectAspect / pictureAspect;
    else d.y *= pictureAspect / objectAspect;
  }

  vec2 result = d + 0.5;
  // Only Contain can leave the picture, and there the water shows around it
  // rather than the edge pixels being smeared out to the border.
  outside = result.x < 0.0 || result.x > 1.0 || result.y < 0.0 || result.y > 1.0;
  return result;
}

void main() {
  ivec2 size = textureSize(uHeight, 0);
  ivec2 texel = ivec2(vUv * vec2(size));

  float left = heightAt(texel - ivec2(1, 0));
  float right = heightAt(texel + ivec2(1, 0));
  float top = heightAt(texel + ivec2(0, 1));
  float bottom = heightAt(texel - ivec2(0, 1));

  // The field is as fine as the object is large, so the slope is stated
  // against a fixed 512-sample field: the same water looks the same whether
  // the object is a thumbnail or a wall.
  vec2 slope = vec2(right - left, top - bottom) * (vec2(size) / 512.0);

  vec2 uv = vUv + slope * refraction * 2.5;
  float here = heightAt(texel);

  vec3 colour;
  if (source_present) {
    bool outside;
    vec2 picture = fitted(uv, outside);
    colour = outside ? water(uv, here) : texture(source, picture).rgb;
  } else {
    colour = water(uv, here);
  }

  // A glint where the surface tilts toward the light, as on a real wave.
  vec3 normal = normalize(vec3(-slope * 8.0, 1.0));
  vec3 toLight = normalize(vec3(0.5, 0.7, 0.6));
  colour += pow(max(dot(normal, toLight), 0.0), 28.0) * highlight;

  outColor = vec4(colour, 1.0);
}
`;

export const waterRippleManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'water-ripple',
  name: 'Water ripple',
  category: 'Surfaces',
  description: 'Rings spreading over water, refracting whatever lies beneath them.',

  // A manifest declares one fragment source, and for a shader drawn in passes
  // the one that reaches the object is the last of them.
  fragmentSource: REFRACT_SOURCE,

  passes: [
    { name: 'height', fragmentSource: HEIGHT_SOURCE },
    {
      name: 'refract',
      fragmentSource: REFRACT_SOURCE,
      reads: [{ uniform: 'uHeight', pass: 'height' }],
    },
  ],

  /**
   * The rings currently on the surface. Nothing here is editable: the user
   * disturbs the water by moving over it, and by how fast it rains.
   */
  simulation: {
    schema: [
      {
        name: 'ripples',
        label: 'Ring',
        type: 'group',
        maxEntries: MAX_RIPPLES,
        entryParameters: [
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
            name: 'age',
            label: 'Age',
            type: 'number',
            defaultValue: 0,
            min: 0,
            max: 60,
            step: 0.001,
          },
          {
            name: 'strength',
            label: 'Strength',
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
    initial: WATER_RIPPLE_INITIAL_STATE,
    advance: advanceWaterRipple,
  },

  parameters: [
    {
      name: 'source',
      label: 'Picture',
      type: 'image',
      group: 'Picture',
      description: 'What the water refracts. With none, it refracts its own colours.',
      defaultValue: '',
    },
    {
      name: 'fit',
      label: 'Fit',
      type: 'enum',
      group: 'Picture',
      defaultValue: 'cover',
      options: [
        { value: 'cover', label: 'Cover' },
        { value: 'contain', label: 'Contain' },
        { value: 'stretch', label: 'Stretch' },
      ],
    },
    {
      name: 'strength',
      label: 'Strength',
      type: 'number',
      group: 'Ripple',
      description: 'How hard the surface is struck.',
      defaultValue: 0.45,
      min: 0.01,
      max: 1,
      step: 0.01,
    },
    {
      name: 'waveSpeed',
      label: 'Wave speed',
      type: 'number',
      group: 'Ripple',
      description: 'How fast a ring travels outward.',
      defaultValue: 0.2,
      min: 0.05,
      max: 0.6,
      step: 0.01,
    },
    {
      name: 'wavelength',
      label: 'Wavelength',
      type: 'number',
      group: 'Ripple',
      description: 'The spacing between crests. Higher is finer.',
      defaultValue: 90,
      min: 20,
      max: 200,
      step: 1,
    },
    {
      name: 'ringLife',
      label: 'Ring life',
      type: 'number',
      group: 'Ripple',
      description: 'Seconds a ring lasts before it has faded away.',
      defaultValue: 1.8,
      min: 0.5,
      max: 4,
      step: 0.1,
    },
    {
      name: 'falloff',
      label: 'Falloff',
      type: 'number',
      group: 'Ripple',
      description: 'How quickly the crests weaken behind the front.',
      defaultValue: 22,
      min: 5,
      max: 60,
      step: 1,
    },
    {
      name: 'rain',
      label: 'Rain',
      type: 'number',
      group: 'Ripple',
      description: 'Drops a second falling on their own. At zero, only the pointer disturbs it.',
      defaultValue: 0.6,
      min: 0,
      max: 6,
      step: 0.1,
    },
    {
      name: 'refraction',
      label: 'Refraction',
      type: 'number',
      group: 'Surface',
      description: 'How far the slope bends what is seen through the water.',
      defaultValue: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      name: 'highlight',
      label: 'Highlight',
      type: 'number',
      group: 'Surface',
      description: 'The glint where the surface catches the light.',
      defaultValue: 0.4,
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      name: 'deepColor',
      label: 'Deep',
      type: 'color',
      group: 'Surface',
      defaultValue: '#0d1220',
    },
    {
      name: 'surfaceColor',
      label: 'Shallow',
      type: 'color',
      group: 'Surface',
      defaultValue: '#2f5f8f',
    },
  ],

  presets: [
    { id: 'default', name: 'Pool', values: {} },
    {
      id: 'still',
      name: 'Still',
      values: { rain: 0, strength: 0.3, waveSpeed: 0.14, ringLife: 2.6, highlight: 0.25 },
    },
    {
      id: 'downpour',
      name: 'Downpour',
      values: {
        rain: 4,
        strength: 0.7,
        waveSpeed: 0.3,
        wavelength: 130,
        ringLife: 1.2,
        refraction: 0.55,
        highlight: 0.6,
      },
    },
    {
      id: 'glass',
      name: 'Glass',
      values: {
        rain: 0.2,
        strength: 0.9,
        wavelength: 160,
        falloff: 40,
        refraction: 0.8,
        highlight: 0.85,
        deepColor: '#101014',
        surfaceColor: '#3a4a5c',
      },
    },
  ],
};
