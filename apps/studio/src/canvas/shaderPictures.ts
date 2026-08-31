import {
  isImageParameter,
  isShaderFill,
  resolveValues,
  type CanvasObject,
  type ShaderManifest,
  type TexSource,
} from '@shader/core';

/**
 * The pictures a shader was pointed at, ready for the renderer.
 *
 * Which parameters take a picture is the manifest's business, so this reads
 * the schema rather than naming a shader: a shader registered later gets its
 * pictures bound because it declares them, not because this file was edited.
 *
 * A parameter with nothing chosen, or whose file is still decoding, is left
 * out entirely — the renderer then reports it absent, and the shader can draw
 * something else in its place.
 */
export function shaderPicturesFor(
  object: CanvasObject,
  manifestOf: (shaderId: string) => ShaderManifest | undefined,
  pictureFor: (parameterName: string, source: string) => TexSource | undefined,
): Readonly<Record<string, TexSource>> | undefined {
  if (!isShaderFill(object.fill)) return undefined;

  const manifest = manifestOf(object.fill.shaderId);
  if (!manifest) return undefined;

  const values = resolveValues(manifest.parameters, object.fill.values);
  let pictures: Record<string, TexSource> | undefined;

  for (const parameter of manifest.parameters) {
    if (!isImageParameter(parameter)) continue;

    const chosen = values[parameter.name];
    if (typeof chosen !== 'string' || chosen === '') continue;

    const ready = pictureFor(parameter.name, chosen);
    if (!ready) continue;

    pictures ??= {};
    pictures[parameter.name] = ready;
  }

  return pictures;
}
