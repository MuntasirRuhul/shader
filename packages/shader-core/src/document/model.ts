import type { ParameterValues } from '../registry/parameterSchema';
import { DEFAULT_BLEND_MODE, type BlendMode } from './blendMode';

/**
 * What the user is building.
 *
 * Everything here is plain serializable data. Parameter values live on the
 * object rather than on the shader, which is what lets two objects share a
 * shader and still look different — and what keeps the document meaningful
 * without a graphics context.
 */

export const OBJECT_TYPES = ['rectangle', 'ellipse', 'text', 'image'] as const;
export type CanvasObjectType = (typeof OBJECT_TYPES)[number];

export function isCanvasObjectType(value: unknown): value is CanvasObjectType {
  return typeof value === 'string' && (OBJECT_TYPES as readonly string[]).includes(value);
}

/** A solid colour fill, as `#rrggbb`. */
export interface SolidFill {
  readonly kind: 'solid';
  readonly color: string;
}

/**
 * A shader fill. The values belong to this object alone, so editing one
 * object's parameters never affects another using the same shader.
 */
export interface ShaderFill {
  readonly kind: 'shader';
  readonly shaderId: string;
  readonly values: ParameterValues;
  /** Which preset the values came from, when one was applied. */
  readonly presetId?: string;
}

export type Fill = SolidFill | ShaderFill;

export function isShaderFill(fill: Fill): fill is ShaderFill {
  return fill.kind === 'shader';
}

export function isSolidFill(fill: Fill): fill is SolidFill {
  return fill.kind === 'solid';
}

export interface TextSettings {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly align: 'left' | 'center' | 'right';
}

export const DEFAULT_TEXT_SETTINGS: TextSettings = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: 48,
  fontWeight: 600,
  lineHeight: 1.2,
  letterSpacing: 0,
  align: 'left',
};

interface BaseObject {
  /** Stable and unique within the document. */
  readonly id: string;
  readonly name: string;
  /** Top-left corner, in canvas coordinates. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Radians, clockwise on screen, about the object's centre. */
  readonly rotation: number;
  readonly opacity: number;
  readonly visible: boolean;
  /** A locked object is skipped by pointer targeting. */
  readonly locked: boolean;
  readonly fill: Fill;
  /** How this object's colour combines with what is beneath it. */
  readonly blendMode: BlendMode;
}

export interface RectangleObject extends BaseObject {
  readonly type: 'rectangle';
  readonly cornerRadius: number;
}

export interface EllipseObject extends BaseObject {
  readonly type: 'ellipse';
}

export interface TextObject extends BaseObject {
  readonly type: 'text';
  readonly text: string;
  readonly textSettings: TextSettings;
}

/**
 * A bitmap or vector brought in from a file.
 *
 * The source travels with the document rather than being referenced on disk:
 * a document that stops working because a file moved is not a document. It
 * costs size — a photograph grows by about a third as text — which is why the
 * importer says so before it embeds one.
 */
export interface ImageObject extends BaseObject {
  readonly type: 'image';
  /** A `data:` URI. Self-contained, so the document survives being sent. */
  readonly source: string;
  /** What the file says it is, e.g. `image/png` or `image/svg+xml`. */
  readonly mediaType: string;
  /** The size the file itself declares, for restoring its proportions. */
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export type CanvasObject = RectangleObject | EllipseObject | TextObject | ImageObject;

export function isTextObject(object: CanvasObject): object is TextObject {
  return object.type === 'text';
}

export function isImageObject(object: CanvasObject): object is ImageObject {
  return object.type === 'image';
}

/** Whether a source is vector, and so worth rasterizing again as it is magnified. */
export function isVectorImage(object: ImageObject): boolean {
  return object.mediaType === 'image/svg+xml';
}

/** The document format version. Stored documents carry it so they can migrate. */
export const DOCUMENT_VERSION = 1;

export interface CanvasDocument {
  readonly version: number;
  readonly id: string;
  readonly name: string;
  /** Back to front: later objects are drawn above earlier ones. */
  readonly objects: readonly CanvasObject[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export const DEFAULT_FILL: SolidFill = { kind: 'solid', color: '#4d7cff' };

export function createDocument(overrides: Partial<CanvasDocument> = {}): CanvasDocument {
  return {
    version: DOCUMENT_VERSION,
    id: 'document',
    name: 'Untitled',
    objects: [],
    canvasWidth: 1200,
    canvasHeight: 800,
    ...overrides,
  };
}

/** Identifiers only have to be unique within a document, so a counter suffices. */
let idCounter = 0;

export function nextObjectId(prefix = 'object'): string {
  idCounter += 1;
  return `${prefix}-${String(idCounter)}`;
}

/** Resets the identifier counter. For tests that assert on exact ids. */
export function resetObjectIds(): void {
  idCounter = 0;
}

type ObjectDefaults = Omit<BaseObject, 'id' | 'fill'> & { fill: Fill };

function baseDefaults(overrides: Partial<BaseObject>): ObjectDefaults {
  return {
    name: 'Object',
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: DEFAULT_FILL,
    blendMode: DEFAULT_BLEND_MODE,
    ...overrides,
  };
}

export function createRectangle(overrides: Partial<RectangleObject> = {}): RectangleObject {
  return {
    ...baseDefaults(overrides),
    id: overrides.id ?? nextObjectId('rectangle'),
    name: overrides.name ?? 'Rectangle',
    type: 'rectangle',
    cornerRadius: overrides.cornerRadius ?? 0,
  };
}

export function createEllipse(overrides: Partial<EllipseObject> = {}): EllipseObject {
  return {
    ...baseDefaults(overrides),
    id: overrides.id ?? nextObjectId('ellipse'),
    name: overrides.name ?? 'Ellipse',
    type: 'ellipse',
  };
}

export function createText(overrides: Partial<TextObject> = {}): TextObject {
  const text = overrides.text ?? '';
  const settings = { ...DEFAULT_TEXT_SETTINGS, ...overrides.textSettings };

  return {
    // One line, which is what an empty text object is. The application fits
    // the box to the words once there are some; starting it at an arbitrary
    // rectangle only means a caret adrift in a large empty box.
    ...baseDefaults({
      width: settings.fontSize * 8,
      height: Math.round(settings.fontSize * settings.lineHeight),
      ...overrides,
    }),
    id: overrides.id ?? nextObjectId('text'),
    // A text object's name follows its content, so the layer list stays legible.
    name: overrides.name ?? (text === '' ? 'Text' : text.slice(0, 40)),
    type: 'text',
    text,
    textSettings: settings,
  };
}

/**
 * An image object, sized to the file's own proportions.
 *
 * A picture arrives with a shape of its own, and the one thing nobody wants is
 * to have to restore it by hand. It is fitted inside `maxSize` so a photograph
 * from a modern camera does not arrive larger than the canvas.
 */
export function createImage(
  source: string,
  mediaType: string,
  naturalWidth: number,
  naturalHeight: number,
  overrides: Partial<ImageObject> = {},
): ImageObject {
  const longest = Math.max(naturalWidth, naturalHeight, 1);
  const fit = Math.min(1, 640 / longest);

  return {
    ...baseDefaults({
      width: Math.max(1, Math.round(naturalWidth * fit)),
      height: Math.max(1, Math.round(naturalHeight * fit)),
      ...overrides,
    }),
    id: overrides.id ?? nextObjectId('image'),
    name: overrides.name ?? 'Image',
    type: 'image',
    source,
    mediaType,
    naturalWidth,
    naturalHeight,
  };
}

/** A shader fill for an object, carrying its own copy of the values. */
export function shaderFill(
  shaderId: string,
  values: ParameterValues = {},
  presetId?: string,
): ShaderFill {
  return {
    kind: 'shader',
    shaderId,
    // Copied so the caller's object cannot later mutate this fill.
    values: { ...values },
    ...(presetId === undefined ? {} : { presetId }),
  };
}

export function solidFill(color: string): SolidFill {
  return { kind: 'solid', color };
}
