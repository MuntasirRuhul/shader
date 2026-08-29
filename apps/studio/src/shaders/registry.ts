import { ShaderRegistry } from '@shader/core';
import { gradientBlurManifest } from './gradientBlur';

/**
 * The shaders the application ships with.
 *
 * Adding one means adding a manifest here and nothing else — no shell,
 * inspector, or runtime change.
 */
export const registry = new ShaderRegistry();

registry.registerOrThrow(gradientBlurManifest);
