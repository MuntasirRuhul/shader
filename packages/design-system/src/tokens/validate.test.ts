import { describe, expect, it } from 'vitest';
import { tokens } from './tokens';
import type { TokenSet } from './types';
import { assertValidTokenSet, validateTokenSet } from './validate';

const emptySet: TokenSet = {
  color: {},
  space: {},
  radius: {},
  typography: {},
  elevation: {},
  motion: {},
};

describe('validateTokenSet', () => {
  it('accepts the shipped token set', () => {
    expect(validateTokenSet(tokens)).toEqual([]);
  });

  it('rejects a themed token missing its dark value', () => {
    const broken = {
      ...emptySet,
      color: { 'surface-panel': { light: '#ffffff' } as unknown as string },
    };

    const errors = validateTokenSet(broken);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ category: 'color', token: 'surface-panel' });
    expect(errors[0]?.message).toContain('dark');
  });

  it('rejects a themed token missing its light value', () => {
    const broken = {
      ...emptySet,
      color: { 'text-primary': { dark: '#ececee' } as unknown as string },
    };

    const errors = validateTokenSet(broken);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('light');
  });

  it('rejects an empty value in one theme', () => {
    const broken = {
      ...emptySet,
      elevation: { 'shadow-sm': { light: '', dark: '0 1px 2px #000' } },
    };

    expect(validateTokenSet(broken)[0]?.message).toContain('light');
  });

  it('rejects a duplicated token name across categories', () => {
    const broken = {
      ...emptySet,
      space: { 'shared-name': '4px' },
      radius: { 'shared-name': '4px' },
    };

    const errors = validateTokenSet(broken);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('unique');
  });

  it('rejects an empty theme-invariant value', () => {
    const broken = { ...emptySet, space: { 'space-1': '  ' } };

    expect(validateTokenSet(broken)[0]?.message).toContain('non-empty');
  });
});

describe('assertValidTokenSet', () => {
  it('does not throw for the shipped token set', () => {
    expect(() => {
      assertValidTokenSet(tokens);
    }).not.toThrow();
  });

  it('throws naming the offending token so the build fails loudly', () => {
    const broken = {
      ...emptySet,
      color: { 'accent-solid': { light: '#3b6cf0' } as unknown as string },
    };

    expect(() => {
      assertValidTokenSet(broken);
    }).toThrow(/accent-solid/);
  });
});
