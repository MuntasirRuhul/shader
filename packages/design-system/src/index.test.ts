import { describe, expect, it } from 'vitest';
import { DESIGN_SYSTEM_PACKAGE } from './index';

describe('@shader/design-system', () => {
  it('runs in a DOM environment', () => {
    expect(DESIGN_SYSTEM_PACKAGE).toBe('@shader/design-system');
    expect(document.body).toBeInTheDocument();
  });
});
