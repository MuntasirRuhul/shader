import {
  isShaderFill,
  SOLID_FILL_SHADER_ID,
  type CanvasDocument,
  type CanvasObject,
  type RenderItem,
  type RenderScene,
  type TexSource,
} from '@shader/core';

/**
 * Turns a document into the scene the renderer draws.
 *
 * Every visible object becomes a render item. A solid fill is drawn by a
 * built-in shader rather than by a separate path, so plain and shader-filled
 * objects interleave correctly in the stacking order and share opacity and
 * masking. Document order is preserved, so the scene arrives back to front.
 */

export interface SceneOptions {
  /** Supplies a text object's rasterized glyph mask, when one exists. */
  readonly maskFor?: (object: CanvasObject) => TexSource | undefined;
}

export function buildScene(document: CanvasDocument, options: SceneOptions = {}): RenderScene {
  const items: RenderItem[] = [];

  for (const object of document.objects) {
    if (!object.visible) continue;

    const mask = options.maskFor?.(object);
    const shaderId = isShaderFill(object.fill) ? object.fill.shaderId : SOLID_FILL_SHADER_ID;
    const values = isShaderFill(object.fill) ? object.fill.values : { color: object.fill.color };

    items.push({
      objectId: object.id,
      shaderId,
      values,
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
