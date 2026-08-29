import { ShaderRegistry, solidFillManifest } from '@shader/core';
import { gradientBlurManifest } from './gradientBlur';

/**
 * The shaders the application ships with.
 *
 * Adding one means adding a manifest here and nothing else — no shell,
 * inspector, or runtime change.
 */
export const registry = new ShaderRegistry();

// The solid fill is how a plain-coloured object is drawn. It is registered
// here but excluded from the library, since it is not something a user picks.
registry.registerOrThrow(solidFillManifest);

registry.registerOrThrow(gradientBlurManifest);

/** The shaders offered in the library, excluding built-ins. */
export function libraryShaders() {
  return registry.list().filter((manifest) => manifest.category !== 'Built-in');
}
