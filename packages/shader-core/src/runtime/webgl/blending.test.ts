import { describe, expect, it } from 'vitest';
import { BLEND_MODES } from '../../document/blendMode';
import { applyBlendMode } from './blending';
import { FakeGl } from './testDouble';

/**
 * How an object is combined with what is beneath it.
 *
 * Only the modes the hardware can perform while drawing are offered. The rest
 * of the familiar set needs to read the backdrop, and a program cannot read
 * the surface it is writing to — so a menu listing them would be a menu where
 * half the entries quietly did nothing.
 */

function setupFor(mode: (typeof BLEND_MODES)[number]) {
  const gl = new FakeGl();
  applyBlendMode(gl, mode);
  return gl.blendState;
}

describe('every offered mode sets the hardware up', () => {
  it.each(BLEND_MODES)('%s asks for a specific combination', (mode) => {
    const setup = setupFor(mode);

    expect(setup.func).toHaveLength(4);
  });

  it('gives each mode a combination of its own', () => {
    const described = BLEND_MODES.map((mode) => JSON.stringify(setupFor(mode)));

    // Two modes resolving to the same setup would be two names for one effect.
    expect(new Set(described).size).toBe(BLEND_MODES.length);
  });
});

describe('what each mode actually asks for', () => {
  const gl = new FakeGl();

  it('leaves normal as ordinary alpha compositing', () => {
    const setup = setupFor('normal');

    expect(setup.func[0]).toBe(gl.SRC_ALPHA);
    expect(setup.func[1]).toBe(gl.ONE_MINUS_SRC_ALPHA);
    expect(setup.equation).toBe(gl.FUNC_ADD);
  });

  it('multiplies by the backdrop for multiply', () => {
    expect(setupFor('multiply').func[0]).toBe(gl.DST_COLOR);
  });

  it('takes the darker of the two for darken', () => {
    // Choosing the smaller value is an equation, not a pair of factors.
    expect(setupFor('darken').equation).toBe(gl.MIN);
  });

  it('takes the lighter of the two for lighten', () => {
    expect(setupFor('lighten').equation).toBe(gl.MAX);
  });

  it('adds without bound for plus lighter', () => {
    const setup = setupFor('add');

    expect(setup.func[1]).toBe(gl.ONE);
    expect(setup.equation).toBe(gl.FUNC_ADD);
  });

  it('never leaves an equation from the mode before it', () => {
    // Darken and lighten change the equation; anything drawn after them must
    // not inherit it, or a normal object would silently blend as a minimum.
    const context = new FakeGl();
    applyBlendMode(context, 'darken');
    applyBlendMode(context, 'normal');

    expect(context.blendState.equation).toBe(context.FUNC_ADD);
  });
});
