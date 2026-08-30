import type { ParameterValues } from '../registry/parameterSchema';

/**
 * What the user is building.
 *
 * Everything here is plain serializable data. Parameter values live on the
 * object rather than on the shader, which is what lets two objects share a
 * shader and still look different — and what keeps the document meaningful
 * without a graphics context.
 */

export const OBJECT_TYPES = ['rectangle', 'ellipse', 'text'] as const;
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

export type CanvasObject = RectangleObject | EllipseObject | TextObject;

export function isTextObject(object: CanvasObject): object is TextObject {
  return object.type === 'text';
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
