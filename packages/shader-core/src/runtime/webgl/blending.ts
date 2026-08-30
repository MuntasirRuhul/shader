import type { BlendMode } from '../../document/blendMode';
import type { GlContext } from './glTypes';

/**
 * Setting up the hardware to combine an object with what is beneath it.
 *
 * Each of these is exact where the object is opaque. Where it is not, the
 * hardware's fixed blending approximates: the standard formulas are defined
 * over premultiplied colour and a full backdrop, and the factors available
 * here cannot express every term. The approximation is the same one every
 * canvas library makes for these modes, and it is invisible until an object is
 * both semi-transparent and blended.
 */
export function applyBlendMode(gl: GlContext, mode: BlendMode): void {
  switch (mode) {
    case 'multiply':
      // Result is source times backdrop, with the backdrop kept where the
      // source is transparent.
      gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.blendEquation(gl.FUNC_ADD);
      return;

    case 'screen':
      // The inverse of multiplying the inverses: always lighter, never clipped.
      gl.blendFuncSeparate(gl.ONE_MINUS_DST_COLOR, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.blendEquation(gl.FUNC_ADD);
      return;

    case 'add':
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.blendEquation(gl.FUNC_ADD);
      return;

    case 'darken':
      // Taking the darker of the two is an equation, not a pair of factors.
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
      gl.blendEquation(gl.MIN);
      return;

    case 'lighten':
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE);
      gl.blendEquation(gl.MAX);
      return;

    case 'normal':
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // Restored explicitly: darken and lighten change the equation, and an
      // object drawn after one of them must not inherit it.
      gl.blendEquation(gl.FUNC_ADD);
      return;
  }
}
