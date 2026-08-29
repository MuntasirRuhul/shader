/**
 * The contract every shader is compiled against.
 *
 * The reference experiments were written full-screen: they read
 * `gl_FragCoord.xy / u_resolution`. That cannot express "fill this rotated
 * rectangle" once a shader becomes an object's fill, so shaders instead read
 * `vUv` — object-local coordinates produced by the vertex stage, which handles
 * translation, scale, and rotation uniformly and lets many objects share one
 * program.
 *
 * Porting a shader is therefore mechanical: replace the screen-space
 * expression with `vUv`.
 */

/** Uniform names the runtime always supplies. Shader parameters may not use them. */
export const RESERVED_UNIFORMS = {
  /** The object's size in pixels, for aspect correction and pixel-scale effects. */
  resolution: 'uResolution',
  /** Seconds since the runtime started, advancing only while rendering. */
  time: 'uTime',
  /** The object's opacity, applied to the shader's output. */
  opacity: 'uOpacity',
  /** Alpha mask sampler, used by text objects. */
  mask: 'uMask',
  /** Whether a mask is bound. */
  hasMask: 'uHasMask',
} as const;

export const RESERVED_UNIFORM_NAMES: readonly string[] = Object.values(RESERVED_UNIFORMS);

const GLSL_VERSION = '#version 300 es';

/**
 * The vertex stage. It draws a unit quad transformed into place and emits the
 * object-local UV the fragment stage reads.
 *
 * Positions arrive as a model matrix rather than baked vertices so that moving
 * or rotating an object costs a uniform update, not a buffer rewrite.
 */
export const QUAD_VERTEX_SOURCE = `${GLSL_VERSION}
precision highp float;

// The unit quad, expanded from gl_VertexID so no attribute buffer is needed.
const vec2 QUAD[4] = vec2[4](
  vec2(0.0, 0.0),
  vec2(1.0, 0.0),
  vec2(0.0, 1.0),
  vec2(1.0, 1.0)
);

uniform mat3 uModel;      // object-local unit space -> clip space
out vec2 vUv;

void main() {
  vec2 corner = QUAD[gl_VertexID];
  vUv = corner;
  vec3 clip = uModel * vec3(corner, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
}
`;

/**
 * Prepended to every shader's fragment source. It declares the version, the
 * precision, the reserved uniforms, the `vUv` varying, and the output — so a
 * shader author writes only the effect.
 */
export const FRAGMENT_PREAMBLE = `${GLSL_VERSION}
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec2 ${RESERVED_UNIFORMS.resolution};
uniform float ${RESERVED_UNIFORMS.time};
uniform float ${RESERVED_UNIFORMS.opacity};
uniform sampler2D ${RESERVED_UNIFORMS.mask};
uniform bool ${RESERVED_UNIFORMS.hasMask};
`;

/** Applied after the shader's own `main`, to fold in opacity and any mask. */
const FRAGMENT_EPILOGUE = `
void main() {
  shaderMain();
  float alpha = ${RESERVED_UNIFORMS.opacity};
  if (${RESERVED_UNIFORMS.hasMask}) {
    alpha *= texture(${RESERVED_UNIFORMS.mask}, vUv).a;
  }
  outColor.a *= alpha;
}
`;

/**
 * Wraps a shader's fragment body into a complete program.
 *
 * The shader declares `void main()`; it is renamed so the runtime's own `main`
 * can apply opacity and masking afterwards without the shader having to know
 * about either.
 */
export function composeFragmentSource(shaderSource: string, uniformDeclarations = ''): string {
  const body = shaderSource.replace(/\bvoid\s+main\s*\(\s*\)/, 'void shaderMain()');

  if (body === shaderSource) {
    throw new Error('A shader fragment source must declare `void main()`; none was found to wrap.');
  }

  return [FRAGMENT_PREAMBLE, uniformDeclarations, body, FRAGMENT_EPILOGUE].join('\n');
}

/** Whether a parameter name would collide with a uniform the runtime owns. */
export function isReservedUniform(name: string): boolean {
  return RESERVED_UNIFORM_NAMES.includes(name);
}
