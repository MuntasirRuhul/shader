/**
 * The fonts a text object can be set in.
 *
 * A webfont arrives after the text that wants it, so this is not simply a
 * list: a face has to be fetched, and everything already drawn in it has to be
 * drawn again once it lands. Until then the browser paints a fallback, and a
 * mask rasterized from that fallback would stay wrong for the life of the
 * document — which is why loading is announced rather than fired and forgotten.
 */

export interface FontChoice {
  /** Stored on the object, and what the family is called to the browser. */
  readonly id: string;
  readonly label: string;
  /** The CSS stack to render with. */
  readonly stack: string;
  /** The Google Fonts axis spec, for families that must be fetched. */
  readonly google?: string;
}

export const FONTS: readonly FontChoice[] = [
  { id: 'system-ui, sans-serif', label: 'System Sans', stack: 'system-ui, sans-serif' },
  { id: 'Georgia, serif', label: 'System Serif', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'ui-monospace, monospace', label: 'System Mono', stack: 'ui-monospace, Menlo, monospace' },
  { id: 'Inter', label: 'Inter', stack: '"Inter", sans-serif', google: 'Inter:wght@100..900' },
  {
    id: 'Archivo',
    label: 'Archivo',
    stack: '"Archivo", sans-serif',
    google: 'Archivo:wght@100..900',
  },
  {
    id: 'Manrope',
    label: 'Manrope',
    stack: '"Manrope", sans-serif',
    google: 'Manrope:wght@200..800',
  },
  {
    id: 'Space Grotesk',
    label: 'Space Grotesk',
    stack: '"Space Grotesk", sans-serif',
    google: 'Space+Grotesk:wght@300..700',
  },
  { id: 'Sora', label: 'Sora', stack: '"Sora", sans-serif', google: 'Sora:wght@100..800' },
  { id: 'Outfit', label: 'Outfit', stack: '"Outfit", sans-serif', google: 'Outfit:wght@100..900' },
  {
    id: 'Figtree',
    label: 'Figtree',
    stack: '"Figtree", sans-serif',
    google: 'Figtree:wght@300..900',
  },
  { id: 'Syne', label: 'Syne', stack: '"Syne", sans-serif', google: 'Syne:wght@400..800' },
  {
    id: 'Playfair Display',
    label: 'Playfair Display',
    stack: '"Playfair Display", serif',
    google: 'Playfair+Display:wght@400..900',
  },
  {
    id: 'Instrument Serif',
    label: 'Instrument Serif',
    stack: '"Instrument Serif", serif',
    google: 'Instrument+Serif',
  },
  { id: 'Anton', label: 'Anton', stack: '"Anton", sans-serif', google: 'Anton' },
  {
    id: 'Bebas Neue',
    label: 'Bebas Neue',
    stack: '"Bebas Neue", sans-serif',
    google: 'Bebas+Neue',
  },
  {
    id: 'JetBrains Mono',
    label: 'JetBrains Mono',
    stack: '"JetBrains Mono", monospace',
    google: 'JetBrains+Mono:wght@100..800',
  },
];

export function fontFor(id: string): FontChoice {
  return FONTS.find((font) => font.id === id) ?? (FONTS[0] as FontChoice);
}

/** The weights a family actually has, read from the axis spec that fetches it. */
export function weightsFor(id: string): readonly number[] {
  const google = fontFor(id).google;
  if (google === undefined) return [300, 400, 500, 600, 700, 800];

  const range = /wght@(\d+)\.\.(\d+)/.exec(google);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    return [100, 200, 300, 400, 500, 600, 700, 800, 900].filter(
      (weight) => weight >= low && weight <= high,
    );
  }

  const single = /wght@(\d+)/.exec(google);
  return single ? [Number(single[1])] : [400];
}

const requested = new Set<string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

/** Whether a family's face is still in flight. */
export function isFontLoading(id: string): boolean {
  return pending.has(id);
}

/**
 * Notifies when a face has landed, so anything drawn in the fallback can be
 * drawn again in the real thing.
 */
export function onFontsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function announce(): void {
  for (const listener of listeners) listener();
}

/**
 * Fetches a family, once. Families already on the system are nothing to fetch
 * and report as ready immediately.
 */
export function loadFont(id: string): void {
  const font = fontFor(id);
  if (font.google === undefined || requested.has(id)) return;

  requested.add(id);
  pending.add(id);
  announce();

  const settled = () => {
    pending.delete(id);
    announce();
  };

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
  link.onload = () => {
    // `document.fonts.ready` reflects the set as it was when asked, so it can
    // resolve before this face lands. Loading the face itself is the only
    // signal that it is actually available to draw with.
    document.fonts.load(`400 40px "${id}"`).then(settled, settled);
  };
  link.onerror = settled;

  document.head.append(link);
}

/** Fetches every family a document is already using, on open. */
export function loadFontsInUse(families: Iterable<string>): void {
  for (const family of new Set(families)) loadFont(family);
}
