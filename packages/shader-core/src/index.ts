export {
  DEFAULT_PARAMETER_GROUP,
  PARAMETER_TYPES,
  defaultValueOf,
  defaultValues,
  groupParameters,
  isGroupParameter,
  isLeafParameter,
  isParameterType,
  parameterGroup,
  type BooleanParameter,
  type ColorParameter,
  type EnumOption,
  type EnumParameter,
  type GroupParameter,
  type LeafParameter,
  type LeafParameterValue,
  type NumberParameter,
  type ParameterSchema,
  type ParameterType,
  type ParameterValue,
  type ParameterValues,
  type ShaderParameter,
  type Vector2Parameter,
  type Vector2Value,
} from './registry/parameterSchema';

export {
  FORBIDDEN_MANIFEST_FIELDS,
  MANIFEST_SCHEMA_VERSION,
  type ShaderManifest,
  type ShaderPreset,
} from './registry/manifest';

export {
  formatManifestErrors,
  leafValueError,
  validateManifest,
  validateValues,
  type ManifestError,
} from './registry/validateManifest';

export { defaultPreset, findPreset, resolvePreset, resolveValues } from './registry/presets';

export {
  ShaderRegistrationError,
  ShaderRegistry,
  shaderRegistry,
  type RegistrationResult,
  type ShaderSummary,
} from './registry/ShaderRegistry';

export {
  IDENTITY_VIEWPORT,
  type RenderingPort,
  type RenderItem,
  type RenderScene,
  type RenderTransform,
  type RenderViewport,
  type RuntimeObserver,
  type RuntimeStatus,
  type ShaderCompileFailure,
  type TexSource,
} from './runtime/renderingPort';

export {
  AnimationLoop,
  browserLoopEnvironment,
  MAX_FRAME_DELTA_MS,
  type AnimationLoopOptions,
  type LoopEnvironment,
} from './runtime/AnimationLoop';

export {
  computeSurfaceSize,
  matchesSurfaceSize,
  MAX_DEVICE_PIXEL_RATIO,
  type SurfaceSize,
} from './runtime/surfaceSize';

export { acquireContext, isRenderingSupported } from './runtime/webgl/context';
export {
  composeFragmentSource,
  QUAD_VERTEX_SOURCE,
  RESERVED_UNIFORMS,
} from './runtime/webgl/shaderAbi';
export { applyModelMatrix, buildModelMatrix } from './runtime/webgl/transform';
export { WebGlRenderer, type WebGlRendererOptions } from './runtime/webgl/WebGlRenderer';

export {
  createDocument,
  createEllipse,
  createRectangle,
  createText,
  DEFAULT_FILL,
  DEFAULT_TEXT_SETTINGS,
  DOCUMENT_VERSION,
  isCanvasObjectType,
  isShaderFill,
  isSolidFill,
  isTextObject,
  nextObjectId,
  OBJECT_TYPES,
  resetObjectIds,
  shaderFill,
  solidFill,
  type CanvasDocument,
  type CanvasObject,
  type CanvasObjectType,
  type EllipseObject,
  type Fill,
  type RectangleObject,
  type ShaderFill,
  type SolidFill,
  type TextObject,
  type TextSettings,
} from './document/model';

export {
  addObject,
  addObjects,
  bringToFront,
  findObject,
  lowerObject,
  objectIndex,
  raiseObject,
  referencedShaderIds,
  removeObject,
  removeObjects,
  reorderObject,
  replaceShaderValues,
  sendToBack,
  setFill,
  setShaderValues,
  updateObject,
  visibleObjects,
  type ObjectChanges,
} from './document/operations';

export {
  describeMissingShader,
  isUnresolved,
  resolveFill,
  unresolvedObjects,
  type ResolvedFill,
  type ShaderLookup,
} from './document/fillResolution';

export {
  boundsOf,
  centreOf,
  enclosedBy,
  hitTest,
  rectFromPoints,
  squareFromPoints,
  toLocalSpace,
  toUnitSpace,
  unionBounds,
  type Point,
  type Rect,
} from './canvas/geometry';

export { isTargetable, objectAt, objectsAt, objectsWithin } from './canvas/hitTesting';

export { SOLID_FILL_SHADER_ID, solidFillManifest } from './runtime/solidShader';

export {
  deserializeDocument,
  documentsEqual,
  exportFilename,
  loadDocument,
  migrations,
  serializeDocument,
  type LoadFailure,
  type LoadResult,
  type RawDocument,
} from './persistence/serialization';

export {
  browserStorage,
  clearStoredDocument,
  DOCUMENT_STORAGE_KEY,
  restoreDocument,
  saveDocument,
  type DocumentStorage,
  type RestoreResult,
  type SaveResult,
} from './persistence/localStore';

export {
  declareUniforms,
  groupCountUniform,
  groupEntryUniform,
} from './runtime/webgl/uniformBinding';

export {
  POINTER_ABSENT,
  type AdvanceContext,
  type AdvanceFunction,
  type PointerInput,
  type SimulationDeclaration,
  type SimulationState,
} from './registry/simulation';
export type { PassInput, ShaderPass } from './registry/manifest';
