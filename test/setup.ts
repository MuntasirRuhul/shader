import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * jsdom implements no layout, so the observers and measurement APIs that
 * floating UI relies on are absent. These stubs let positioning code run; they
 * report zero geometry, which is correct enough for behavioural assertions.
 */
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

if (!('DOMRect' in globalThis)) {
  globalThis.DOMRect = class DOMRect {
    constructor(
      readonly x = 0,
      readonly y = 0,
      readonly width = 0,
      readonly height = 0,
    ) {}
    get top(): number {
      return this.y;
    }
    get left(): number {
      return this.x;
    }
    get right(): number {
      return this.x + this.width;
    }
    get bottom(): number {
      return this.y + this.height;
    }
    static fromRect(other?: DOMRectInit): DOMRect {
      return new DOMRect(other?.x, other?.y, other?.width, other?.height);
    }
    toJSON(): unknown {
      return this;
    }
  };
}

// Radix uses pointer capture for some interactions; jsdom does not implement it.
if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

afterEach(() => {
  cleanup();
});
