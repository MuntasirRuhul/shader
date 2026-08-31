import { imageFillManifest, ShaderRegistry, solidFillManifest } from '@shader/core';
import { fluidManifest } from './fluid';
import { gradientBlurManifest } from './gradientBlur';
import { inkTrailManifest } from './inkTrail';
import { meshGradientManifest } from './meshGradient';
import { metaballManifest } from './metaball';
import { ribbonManifest } from './ribbon';
import { waterRippleManifest } from './waterRipple';

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
registry.registerOrThrow(imageFillManifest);

registry.registerOrThrow(meshGradientManifest);
registry.registerOrThrow(metaballManifest);
registry.registerOrThrow(ribbonManifest);
registry.registerOrThrow(gradientBlurManifest);
registry.registerOrThrow(waterRippleManifest);
registry.registerOrThrow(fluidManifest);
registry.registerOrThrow(inkTrailManifest);

/** The shaders offered in the library, excluding built-ins. */
export function libraryShaders() {
  return registry.list().filter((manifest) => manifest.category !== 'Built-in');
}
