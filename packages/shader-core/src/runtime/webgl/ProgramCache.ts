import type { ShaderManifest, ShaderPass } from '../../registry/manifest';
import type { ShaderCompileFailure } from '../renderingPort';
import type { GlContext, GlProgram, GlUniformLocation } from './glTypes';
import {
  composeFragmentSource,
  PRESENT_FRAGMENT_SOURCE,
  PRESENT_SOURCE_UNIFORM,
  QUAD_VERTEX_SOURCE,
} from './shaderAbi';
import { declareUniforms } from './uniformBinding';

/** The key the built-in pass-compositing program is held under. */
const PRESENT_KEY = '\u0000present';

/** The key a pass's program is held under, kept distinct per shader. */
export function passProgramKey(shaderId: string, passName: string): string {
  return `${shaderId}#${passName}`;
}

export interface CompiledProgram {
  readonly shaderId: string;
  readonly program: GlProgram;
  /** Uniform locations, looked up once and reused every frame. */
  location: (name: string) => GlUniformLocation | null;
}

interface ProgramSources {
  readonly vertexSource: string;
  /** The shader's own fragment body, before the ABI wraps it. */
  readonly fragmentSource: string;
  readonly uniformDeclarations: string;
  /** Set when this program belongs to a named pass, for the diagnostic. */
  readonly passName?: string;
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
    return this.acquireKeyed(manifest.id, manifest.id, {
      vertexSource: manifest.vertexSource ?? QUAD_VERTEX_SOURCE,
      fragmentSource: manifest.fragmentSource,
      uniformDeclarations: this.declarationsFor(manifest),
    });
  }

  /**
   * The program for one of a shader's passes. Each pass is its own program:
   * they share the shader's parameters and state, but not their fragment code.
   */
  acquirePass(manifest: ShaderManifest, pass: ShaderPass): CompileResult {
    const samplers = (pass.reads ?? [])
      .map((input) => `uniform sampler2D ${input.uniform};`)
      .join('\n');

    return this.acquireKeyed(passProgramKey(manifest.id, pass.name), manifest.id, {
      vertexSource: manifest.vertexSource ?? QUAD_VERTEX_SOURCE,
      fragmentSource: pass.fragmentSource,
      uniformDeclarations: [this.declarationsFor(manifest), samplers]
        .filter((part) => part !== '')
        .join('\n'),
      passName: pass.name,
    });
  }

  /**
   * The built-in program that draws a finished pass onto the object. Only a
   * shader whose last pass is itself read needs it, since every other
   * multi-pass shader ends by drawing straight to the canvas.
   */
  acquirePresent(): CompileResult {
    return this.acquireKeyed(PRESENT_KEY, PRESENT_KEY, {
      vertexSource: QUAD_VERTEX_SOURCE,
      fragmentSource: PRESENT_FRAGMENT_SOURCE,
      uniformDeclarations: `uniform sampler2D ${PRESENT_SOURCE_UNIFORM};`,
    });
  }

  /**
   * State binds through the same uniforms parameters do, so it is declared the
   * same way — a shader author writes neither by hand.
   */
  private declarationsFor(manifest: ShaderManifest): string {
    return declareUniforms([...manifest.parameters, ...(manifest.simulation?.schema ?? [])]);
  }

  private acquireKeyed(key: string, shaderId: string, sources: ProgramSources): CompileResult {
    const cached = this.programs.get(key);
    if (cached) return { ok: true, compiled: cached };

    const recorded = this.failures.get(key);
    if (recorded) return { ok: false, failure: recorded };

    const result = this.compile(shaderId, sources);
    if (result.ok) {
      this.programs.set(key, result.compiled);
    } else {
      this.failures.set(key, result.failure);
    }
    return result;
  }

  private compile(shaderId: string, sources: ProgramSources): CompileResult {
    const { gl } = this;
    this.compileCount += 1;

    // A pass failure names the pass: "this shader is broken" is not enough to
    // find the fault when a shader has several programs.
    const where = sources.passName === undefined ? '' : `Pass "${sources.passName}": `;
    const fail = (stage: ShaderCompileFailure['stage'], diagnostic: string): CompileResult => ({
      ok: false,
      failure: { shaderId, stage, diagnostic: `${where}${diagnostic}` },
    });

    const { vertexSource } = sources;
    let fragmentSource: string;
    try {
      fragmentSource = composeFragmentSource(sources.fragmentSource, sources.uniformDeclarations);
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
      shaderId,
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

  /** Releases every program held for a shader — its own and its passes'. */
  release(shaderId: string): void {
    const prefix = `${shaderId}#`;
    for (const key of [...this.programs.keys()]) {
      if (key !== shaderId && !key.startsWith(prefix)) continue;
      const compiled = this.programs.get(key);
      if (compiled) this.gl.deleteProgram(compiled.program);
      this.programs.delete(key);
    }
    for (const key of [...this.failures.keys()]) {
      if (key === shaderId || key.startsWith(prefix)) this.failures.delete(key);
    }
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
