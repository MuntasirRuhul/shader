import {
  IMAGE_FILL_SHADER_ID,
  isShaderFill,
  POINTER_ABSENT,
  SOLID_FILL_SHADER_ID,
  toUnitSpace,
  type CanvasDocument,
  type CanvasObject,
  type RenderItem,
  type Point,
  type PointerInput,
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
  /** Supplies an image object's decoded picture, once it has decoded. */
  readonly imageFor?: (object: CanvasObject) => TexSource | undefined;
  /**
   * Where the pointer is, in canvas coordinates. Each object receives it in
   * its own frame, so a shader reacting to the pointer needs no knowledge of
   * where its object sits or how it is turned.
   */
  readonly pointer?: Point | undefined;
}

export function buildScene(document: CanvasDocument, options: SceneOptions = {}): RenderScene {
  const items: RenderItem[] = [];

  for (const object of document.objects) {
    if (!object.visible) continue;

    // A text object is its glyphs. With no text there are no glyphs, and
    // drawing it anyway fills its whole box with the shader — which is what a
    // newly created text object used to look like: a solid slab with a caret
    // in it.
    if (object.type === 'text' && object.text.trim() === '') continue;

    const mask = options.maskFor?.(object);
    const image = options.imageFor?.(object);

    // An imported picture draws itself unless a shader has been put over it,
    // in which case the picture is still bound for that shader to sample.
    const builtIn = object.type === 'image' ? IMAGE_FILL_SHADER_ID : SOLID_FILL_SHADER_ID;
    const shaderId = isShaderFill(object.fill) ? object.fill.shaderId : builtIn;
    const values = isShaderFill(object.fill) ? object.fill.values : { color: object.fill.color };

    items.push({
      objectId: object.id,
      shaderId,
      values,
      pointer: pointerOver(object, options.pointer),
      transform: {
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        rotation: object.rotation,
      },
      opacity: object.opacity,
      blendMode: object.blendMode,
      ...(mask === undefined ? {} : { mask }),
      ...(image === undefined ? {} : { image }),
    });
  }

  return { items };
}

/**
 * The pointer in one object's own coordinates.
 *
 * Reported absent rather than stale when it is elsewhere: holding the last
 * position would leave a shader reacting to a cursor that has gone.
 */
function pointerOver(object: CanvasObject, pointer: Point | undefined): PointerInput {
  if (!pointer) return POINTER_ABSENT;

  const local = toUnitSpace(pointer, object);
  const inside = local.x >= 0 && local.x <= 1 && local.y >= 0 && local.y <= 1;

  return inside ? { present: true, x: local.x, y: local.y } : POINTER_ABSENT;
}
