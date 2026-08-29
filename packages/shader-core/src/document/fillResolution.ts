import type { ShaderManifest } from '../registry/manifest';
import type { ParameterValues } from '../registry/parameterSchema';
import { resolveValues } from '../registry/presets';
import { isShaderFill, type CanvasDocument, type CanvasObject, type Fill } from './model';

/**
 * Resolving a fill against the registry.
 *
 * A shader can be missing for ordinary reasons — a document exported when a
 * shader existed, opened after it was renamed or removed. The object is then
 * shown in an unresolved state that names the shader, and the rest of the
 * document stays fully editable. Refusing to load, or silently dropping the
 * fill, would both lose the user's work.
 */

export type ResolvedFill =
  | { readonly kind: 'solid'; readonly color: string }
  | {
      readonly kind: 'shader';
      readonly shaderId: string;
      readonly manifest: ShaderManifest;
      /** Complete values, with anything omitted taken from the defaults. */
      readonly values: ParameterValues;
    }
  | {
      readonly kind: 'unresolved';
      /** The shader the object asked for, so the user can be told which. */
      readonly shaderId: string;
      /** Kept so the values survive a round trip through the missing state. */
      readonly values: ParameterValues;
    };

export interface ShaderLookup {
  get: (shaderId: string) => ShaderManifest | undefined;
}

export function resolveFill(fill: Fill, registry: ShaderLookup): ResolvedFill {
  if (!isShaderFill(fill)) {
    return { kind: 'solid', color: fill.color };
  }

  const manifest = registry.get(fill.shaderId);
  if (!manifest) {
    return { kind: 'unresolved', shaderId: fill.shaderId, values: fill.values };
  }

  return {
    kind: 'shader',
    shaderId: fill.shaderId,
    manifest,
    values: resolveValues(manifest.parameters, fill.values),
  };
}

export function isUnresolved(
  fill: ResolvedFill,
): fill is Extract<ResolvedFill, { kind: 'unresolved' }> {
  return fill.kind === 'unresolved';
}

/** Objects whose shader is not registered, paired with the missing identifier. */
export function unresolvedObjects(
  document: CanvasDocument,
  registry: ShaderLookup,
): { object: CanvasObject; shaderId: string }[] {
  return document.objects.flatMap((object) => {
    if (!isShaderFill(object.fill)) return [];
    if (registry.get(object.fill.shaderId)) return [];
    return [{ object, shaderId: object.fill.shaderId }];
  });
}

/** A message naming what is missing, for the inspector to show. */
export function describeMissingShader(shaderId: string): string {
  return `The shader "${shaderId}" is not available, so this object cannot be drawn. Choose another shader, or restore the one it expects.`;
}
