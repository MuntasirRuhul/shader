import { MANIFEST_SCHEMA_VERSION, type ShaderManifest } from '../registry/manifest';

/**
 * The shader that draws an imported picture.
 *
 * An image is a fill like any other, so it goes through the same path as a
 * colour or a shader: same stacking order, same opacity, same masking, same
 * placement through the viewport. A second, parallel way of getting pixels on
 * screen would have to be kept in step with all of that forever.
 *
 * Registered by the runtime rather than shipped in the library, so nobody
 * picks it from a list — it arrives with the file.
 */
export const IMAGE_FILL_SHADER_ID = '@image';

export const imageFillManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: IMAGE_FILL_SHADER_ID,
  name: 'Image',
  category: 'Built-in',
  description: 'Draws an imported image. Used for objects created from a file.',

  fragmentSource: `
void main() {
  // No image bound yet — the file is still decoding, and a checkerboard or a
  // colour would flash in its place.
  if (!uHasImage) {
    outColor = vec4(0.0);
    return;
  }
  outColor = texture(uImage, vUv);
}
`,

  parameters: [],
  presets: [{ id: 'default', name: 'Default', values: {} }],
};
