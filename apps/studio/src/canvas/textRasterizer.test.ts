import { createText, resetObjectIds, type TextObject } from '@shader/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MASK_SCALES, maskKey, maskScaleFor, TextMaskCache, wrapText } from './textRasterizer';

/**
 * jsdom has no 2D context, so the rasterizing path is exercised against a
 * recording stub. What is asserted here is the decision-making — what gets
 * re-rasterized and when — which is where the behaviour lives.
 */
function stubCanvas2d() {
  const calls: { text: string; x: number; y: number }[] = [];
  const context = {
    scale: vi.fn(),
    fillText: (text: string, x: number, y: number) => calls.push({ text, x, y }),
    measureText: (text: string) => ({ width: text.length * 10 }),
    font: '',
    textBaseline: '',
    fillStyle: '',
    letterSpacing: '',
  };

  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);

  return { calls, restore: () => spy.mockRestore() };
}

let cache: TextMaskCache;
let text: TextObject;

beforeEach(() => {
  resetObjectIds();
  cache = new TextMaskCache();
  text = createText({ id: 't', text: 'Hello', width: 400, height: 100 });
});

describe('choosing a mask scale', () => {
  it('uses the smallest scale that covers the zoom', () => {
    expect(maskScaleFor(0.5)).toBe(1);
    expect(maskScaleFor(1)).toBe(1);
    expect(maskScaleFor(1.2)).toBe(2);
    expect(maskScaleFor(3)).toBe(4);
  });

  it('accounts for the device pixel ratio', () => {
    expect(maskScaleFor(1, 2)).toBe(2);
    expect(maskScaleFor(0.6, 2)).toBe(2);
  });

  it('caps at the largest scale rather than growing without bound', () => {
    expect(maskScaleFor(100)).toBe(MASK_SCALES[MASK_SCALES.length - 1]);
  });

  it('does not change across small zoom movements', () => {
    // Everything from just above 1 to 2 shares a scale, so a pinch does not
    // re-rasterize on every frame.
    expect(maskScaleFor(1.1)).toBe(maskScaleFor(1.9));
  });
});

describe('what changes the mask', () => {
  it('changes with the text content', () => {
    expect(maskKey(text, 1)).not.toBe(maskKey({ ...text, text: 'Goodbye' }, 1));
  });

  it('changes with the size', () => {
    expect(maskKey(text, 1)).not.toBe(maskKey({ ...text, width: 500 }, 1));
  });

  it('changes with the font', () => {
    const restyled = {
      ...text,
      textSettings: { ...text.textSettings, fontFamily: 'Georgia' },
    };

    expect(maskKey(text, 1)).not.toBe(maskKey(restyled, 1));
  });

  it('changes with the font size', () => {
    const resized = { ...text, textSettings: { ...text.textSettings, fontSize: 96 } };

    expect(maskKey(text, 1)).not.toBe(maskKey(resized, 1));
  });

  it('changes with the scale', () => {
    expect(maskKey(text, 1)).not.toBe(maskKey(text, 2));
  });

  it('does not change with position or rotation', () => {
    const moved = { ...text, x: 900, y: 900, rotation: 1.2 };

    expect(maskKey(text, 1)).toBe(maskKey(moved, 1));
  });
});

describe('wrapping text to the object width', () => {
  const context = { measureText: (value: string) => ({ width: value.length * 10 }) };

  it('keeps short text on one line', () => {
    expect(wrapText(context as never, 'Hello', 400)).toEqual(['Hello']);
  });

  it('wraps at the width', () => {
    // Each character measures 10 wide, so 100 fits ten characters.
    expect(wrapText(context as never, 'aaaaa bbbbb ccccc', 100)).toEqual([
      'aaaaa',
      'bbbbb',
      'ccccc',
    ]);
  });

  it('honours explicit line breaks', () => {
    expect(wrapText(context as never, 'one\ntwo', 1000)).toEqual(['one', 'two']);
  });

  it('preserves an empty line', () => {
    expect(wrapText(context as never, 'one\n\ntwo', 1000)).toEqual(['one', '', 'two']);
  });

  it('does not drop a word longer than the width', () => {
    expect(wrapText(context as never, 'supercalifragilistic', 50)).toEqual([
      'supercalifragilistic',
    ]);
  });
});

describe('the mask cache', () => {
  it('rasterizes once for an unchanged object', () => {
    const stub = stubCanvas2d();
    try {
      cache.maskFor(text, 1);
      cache.maskFor(text, 1);
      cache.maskFor(text, 1);

      expect(cache.rasterizationCount).toBe(1);
    } finally {
      stub.restore();
    }
  });

  it('re-rasterizes when the content changes', () => {
    const stub = stubCanvas2d();
    try {
      cache.maskFor(text, 1);
      cache.maskFor({ ...text, text: 'Changed' }, 1);

      expect(cache.rasterizationCount).toBe(2);
    } finally {
      stub.restore();
    }
  });

  it('re-rasterizes when the zoom crosses a threshold', () => {
    const stub = stubCanvas2d();
    try {
      cache.maskFor(text, 1);
      cache.maskFor(text, 1.5);

      expect(cache.rasterizationCount).toBe(2);
    } finally {
      stub.restore();
    }
  });

  it('does not re-rasterize for a zoom within the same threshold', () => {
    const stub = stubCanvas2d();
    try {
      cache.maskFor(text, 1.2);
      cache.maskFor(text, 1.8);

      expect(cache.rasterizationCount).toBe(1);
    } finally {
      stub.restore();
    }
  });

  it('does not re-rasterize when the object merely moves', () => {
    const stub = stubCanvas2d();
    try {
      cache.maskFor(text, 1);
      cache.maskFor({ ...text, x: 500, y: 500, rotation: 0.8 }, 1);

      expect(cache.rasterizationCount).toBe(1);
    } finally {
      stub.restore();
    }
  });

  it('advances the revision so the runtime re-uploads', () => {
    const stub = stubCanvas2d();
    try {
      const first = cache.maskFor(text, 1);
      const second = cache.maskFor({ ...text, text: 'Changed' }, 1);

      expect(second?.revision).toBeGreaterThan(first?.revision ?? 0);
    } finally {
      stub.restore();
    }
  });

  it('keeps the revision stable while nothing changes', () => {
    const stub = stubCanvas2d();
    try {
      const first = cache.maskFor(text, 1);
      const second = cache.maskFor(text, 1);

      expect(second?.revision).toBe(first?.revision);
    } finally {
      stub.restore();
    }
  });

  it('produces no mask for empty text', () => {
    expect(cache.maskFor({ ...text, text: '' }, 1)).toBeUndefined();
    expect(cache.rasterizationCount).toBe(0);
  });

  it('forgets an object that is gone', () => {
    const stub = stubCanvas2d();
    try {
      cache.maskFor(text, 1);
      cache.release('t');

      expect(cache.size).toBe(0);
    } finally {
      stub.restore();
    }
  });

  it('retains only the objects still present', () => {
    const stub = stubCanvas2d();
    try {
      cache.maskFor(text, 1);
      cache.maskFor(createText({ id: 'other', text: 'Other' }), 1);
      cache.retainOnly(['t']);

      expect(cache.size).toBe(1);
    } finally {
      stub.restore();
    }
  });
});

describe('drawing the glyphs', () => {
  it('draws each wrapped line', () => {
    const stub = stubCanvas2d();
    try {
      cache.maskFor({ ...text, text: 'one\ntwo' }, 1);

      expect(stub.calls.map((call) => call.text)).toEqual(['one', 'two']);
    } finally {
      stub.restore();
    }
  });

  it('stacks lines by the line height', () => {
    const stub = stubCanvas2d();
    try {
      cache.maskFor({ ...text, text: 'one\ntwo' }, 1);

      const lineHeight = text.textSettings.fontSize * text.textSettings.lineHeight;
      expect(stub.calls[1]?.y).toBeCloseTo(lineHeight, 5);
    } finally {
      stub.restore();
    }
  });

  it('left-aligns by default', () => {
    const stub = stubCanvas2d();
    try {
      cache.maskFor(text, 1);

      expect(stub.calls[0]?.x).toBe(0);
    } finally {
      stub.restore();
    }
  });

  it('centres when asked', () => {
    const stub = stubCanvas2d();
    try {
      cache.maskFor({ ...text, textSettings: { ...text.textSettings, align: 'center' } }, 1);

      // "Hello" measures 50 in the stub, centred in 400.
      expect(stub.calls[0]?.x).toBeCloseTo(175, 5);
    } finally {
      stub.restore();
    }
  });
});
