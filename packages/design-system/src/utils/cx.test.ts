import { describe, expect, it } from 'vitest';
import { cx } from './cx';

describe('cx', () => {
  it('joins the truthy values', () => {
    expect(cx('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cx('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('returns an empty string when nothing is truthy', () => {
    expect(cx(false, undefined)).toBe('');
  });
});
