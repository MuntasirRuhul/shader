import {
  isShaderFill,
  type CanvasDocument,
  type CanvasObject,
  type RenderItem,
  type RenderScene,
  type TexSource,
} from '@shader/core';

/**
 * Turns a document into the scene the renderer draws.
 *
 * Only objects that are visible and carry a shader fill become render items —
 * a solid fill needs no shader program, and a hidden object needs no work at
 * all. Document order is preserved, so the scene arrives back to front.
 */

export interface SceneOptions {
  /** Supplies a text object's rasterized glyph mask, when one exists. */
  readonly maskFor?: (object: CanvasObject) => TexSource | undefined;
}

export function buildScene(document: CanvasDocument, options: SceneOptions = {}): RenderScene {
  const items: RenderItem[] = [];

  for (const object of document.objects) {
    if (!object.visible) continue;
    if (!isShaderFill(object.fill)) continue;

    const mask = options.maskFor?.(object);

    items.push({
      objectId: object.id,
      shaderId: object.fill.shaderId,
      values: object.fill.values,
      transform: {
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        rotation: object.rotation,
      },
      opacity: object.opacity,
      ...(mask === undefined ? {} : { mask }),
    });
  }

  return { items };
}
