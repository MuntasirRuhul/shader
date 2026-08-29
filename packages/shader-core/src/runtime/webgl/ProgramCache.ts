import type { ShaderManifest } from '../../registry/manifest';
import type { ShaderCompileFailure } from '../renderingPort';
import type { GlContext, GlProgram, GlUniformLocation } from './glTypes';
import { composeFragmentSource, QUAD_VERTEX_SOURCE } from './shaderAbi';
import { declareUniforms } from './uniformBinding';

export interface CompiledProgram {
  readonly shaderId: string;
  readonly program: GlProgram;
  /** Uniform locations, looked up once and reused every frame. */
  location: (name: string) => GlUniformLocation | null;
}

export type CompileResult =
  | { readonly ok: true; readonly compiled: CompiledProgram }
  | { readonly ok: false; readonly failure: ShaderCompileFailure };

/**
 * Compiles shader programs and keeps them for the life of a graphics context.
 *
 * Compilation is expensive and a program is identical for every object using
 * the shader, so it happens once per shader per context. A failure is recorded
 * too: a broken shader must not be retried on every frame.
 */
export class ProgramCache {
  private readonly programs = new Map<string, CompiledProgram>();
  private readonly failures = new Map<string, ShaderCompileFailure>();
  private compileCount = 0;

  constructor(private readonly gl: GlContext) {}

  /** How many programs have actually been compiled. Lets tests prove reuse. */
  get compilations(): number {
    return this.compileCount;
  }

  get size(): number {
    return this.programs.size;
  }

  /** A previously recorded failure for a shader, if it has one. */
  failureFor(shaderId: string): ShaderCompileFailure | undefined {
    return this.failures.get(shaderId);
  }

  /**
   * The compiled program for a manifest, compiling it on first use.
   *
   * A shader that already failed returns its recorded failure without
   * recompiling, so one broken shader costs one compile, not one per frame.
   */
  acquire(manifest: ShaderManifest): CompileResult {
    const cached = this.programs.get(manifest.id);
    if (cached) return { ok: true, compiled: cached };

    const recorded = this.failures.get(manifest.id);
    if (recorded) return { ok: false, failure: recorded };

    const result = this.compile(manifest);
    if (result.ok) {
      this.programs.set(manifest.id, result.compiled);
    } else {
      this.failures.set(manifest.id, result.failure);
    }
    return result;
  }

  private compile(manifest: ShaderManifest): CompileResult {
    const { gl } = this;
    this.compileCount += 1;

    const fail = (stage: ShaderCompileFailure['stage'], diagnostic: string): CompileResult => ({
      ok: false,
      failure: { shaderId: manifest.id, stage, diagnostic },
    });

    const vertexSource = manifest.vertexSource ?? QUAD_VERTEX_SOURCE;
    let fragmentSource: string;
    try {
      fragmentSource = composeFragmentSource(
        manifest.fragmentSource,
        declareUniforms(manifest.parameters),
      );
    } catch (error) {
      return fail('fragment', error instanceof Error ? error.message : String(error));
    }

    const vertex = this.compileStage(gl.VERTEX_SHADER, vertexSource);
    if (!vertex.ok) return fail('vertex', vertex.diagnostic);

    const fragment = this.compileStage(gl.FRAGMENT_SHADER, fragmentSource);
    if (!fragment.ok) {
      gl.deleteShader(vertex.shader);
      return fail('fragment', fragment.diagnostic);
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertex.shader);
      gl.deleteShader(fragment.shader);
      return fail('link', 'The graphics driver did not create a program object.');
    }

    gl.attachShader(program, vertex.shader);
    gl.attachShader(program, fragment.shader);
    gl.linkProgram(program);

    // The shader objects are no longer needed once linked, whatever the outcome.
    gl.deleteShader(vertex.shader);
    gl.deleteShader(fragment.shader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const diagnostic = gl.getProgramInfoLog(program) ?? 'Linking failed with no diagnostic.';
      gl.deleteProgram(program);
      return fail('link', diagnostic);
    }

    const locations = new Map<string, GlUniformLocation | null>();
    const compiled: CompiledProgram = {
      shaderId: manifest.id,
      program,
      location: (name) => {
        if (!locations.has(name)) {
          locations.set(name, gl.getUniformLocation(program, name));
        }
        return locations.get(name) ?? null;
      },
    };

    return { ok: true, compiled };
  }

  private compileStage(
    type: number,
    source: string,
  ):
    | { ok: true; shader: NonNullable<ReturnType<GlContext['createShader']>> }
    | {
        ok: false;
        diagnostic: string;
      } {
    const { gl } = this;
    const shader = gl.createShader(type);
    if (!shader) {
      return { ok: false, diagnostic: 'The graphics driver did not create a shader object.' };
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const diagnostic = gl.getShaderInfoLog(shader) ?? 'Compilation failed with no diagnostic.';
      gl.deleteShader(shader);
      return { ok: false, diagnostic };
    }

    return { ok: true, shader };
  }

  /** Releases the program held for a shader, if any. */
  release(shaderId: string): void {
    const compiled = this.programs.get(shaderId);
    if (compiled) {
      this.gl.deleteProgram(compiled.program);
      this.programs.delete(shaderId);
    }
    this.failures.delete(shaderId);
  }

  /** Releases every program. Used on teardown and on context loss. */
  releaseAll(): void {
    for (const compiled of this.programs.values()) {
      this.gl.deleteProgram(compiled.program);
    }
    this.programs.clear();
    this.failures.clear();
  }

  /**
   * Forgets everything without deleting, for use after the context is lost —
   * the driver has already discarded the objects, so deleting them is invalid.
   */
  forgetAll(): void {
    this.programs.clear();
    this.failures.clear();
  }
}
