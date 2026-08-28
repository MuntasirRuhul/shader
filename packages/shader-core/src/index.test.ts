import { describe, expect, it } from 'vitest';
import { CORE_PACKAGE } from './index';

describe('@shader/core', () => {
  it('is testable without a DOM', () => {
    expect(CORE_PACKAGE).toBe('@shader/core');
    expect(typeof globalThis.document).toBe('undefined');
  });
});
