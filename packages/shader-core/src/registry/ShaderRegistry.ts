import type { ShaderManifest } from './manifest';
import { formatManifestErrors, validateManifest, type ManifestError } from './validateManifest';

/** What the library needs to list a shader, without its sources or schema. */
export interface ShaderSummary {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly description?: string;
}

export type RegistrationResult =
  | { readonly ok: true; readonly manifest: ShaderManifest }
  | { readonly ok: false; readonly errors: readonly ManifestError[] };

export class ShaderRegistrationError extends Error {
  constructor(
    readonly shaderId: string,
    readonly errors: readonly ManifestError[],
  ) {
    super(formatManifestErrors(shaderId, errors));
    this.name = 'ShaderRegistrationError';
  }
}

/**
 * Holds the shaders the application knows about.
 *
 * Registration is the only gate: a manifest either validates and becomes fully
 * usable, or is refused with every reason named. Nothing partially registered
 * is ever visible, so a consumer never has to defend against a half-built
 * shader.
 */
export class ShaderRegistry {
  private readonly manifests = new Map<string, ShaderManifest>();

  /** Registers a manifest, or reports why it cannot be registered. */
  register(manifest: ShaderManifest): RegistrationResult {
    const errors = [...validateManifest(manifest)];

    if (this.manifests.has(manifest.id)) {
      errors.push({
        path: 'id',
        message: `A shader with the identifier "${manifest.id}" is already registered.`,
      });
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    this.manifests.set(manifest.id, manifest);
    return { ok: true, manifest };
  }

  /** Registers a manifest, throwing if it is invalid. For built-in shaders. */
  registerOrThrow(manifest: ShaderManifest): ShaderManifest {
    const result = this.register(manifest);
    if (!result.ok) {
      throw new ShaderRegistrationError(manifest.id, result.errors);
    }
    return result.manifest;
  }

  has(id: string): boolean {
    return this.manifests.has(id);
  }

  /**
   * The manifest for an identifier, or `undefined` when it is not registered.
   * Never a partial manifest: an unregistered shader has no representation.
   */
  get(id: string): ShaderManifest | undefined {
    return this.manifests.get(id);
  }

  /** The manifest for an identifier, throwing when it is not registered. */
  getOrThrow(id: string): ShaderManifest {
    const manifest = this.manifests.get(id);
    if (!manifest) {
      throw new Error(`No shader is registered with the identifier "${id}".`);
    }
    return manifest;
  }

  /** Every registered shader, in registration order. */
  list(): ShaderManifest[] {
    return [...this.manifests.values()];
  }

  /** Display metadata for every registered shader, for the library panel. */
  summaries(): ShaderSummary[] {
    return this.list().map((manifest) => ({
      id: manifest.id,
      name: manifest.name,
      category: manifest.category,
      ...(manifest.description === undefined ? {} : { description: manifest.description }),
    }));
  }

  /** Registered shaders grouped by category, preserving registration order. */
  byCategory(): { category: string; shaders: ShaderSummary[] }[] {
    const order: string[] = [];
    const grouped = new Map<string, ShaderSummary[]>();

    for (const summary of this.summaries()) {
      let bucket = grouped.get(summary.category);
      if (!bucket) {
        bucket = [];
        grouped.set(summary.category, bucket);
        order.push(summary.category);
      }
      bucket.push(summary);
    }

    return order.map((category) => ({ category, shaders: grouped.get(category) ?? [] }));
  }

  get size(): number {
    return this.manifests.size;
  }

  /** Removes every registration. Used by tests to start from a clean state. */
  clear(): void {
    this.manifests.clear();
  }
}

/** The registry the application uses. Built-in shaders register themselves here. */
export const shaderRegistry = new ShaderRegistry();
