/**
 * Reading a picture from a file into something a document can hold.
 *
 * The bytes travel with the document rather than being referenced on disk, so
 * a file that is sent, or opened on another machine, still shows its pictures.
 * That costs size — base64 grows the bytes by about a third — which is why the
 * limit is stated and refused rather than silently swallowed.
 */

export const IMPORTABLE_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
];

/** What a file input should offer. */
export const IMAGE_FILE_ACCEPT = `${IMPORTABLE_IMAGE_TYPES.join(',')},.svg`;

/**
 * The largest file that is embedded.
 *
 * Beyond this a document becomes slow to save, slow to open, and awkward to
 * send — the three things embedding was meant to protect.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface ImportedImage {
  readonly source: string;
  readonly mediaType: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export type ImageImportResult =
  | { readonly ok: true; readonly image: ImportedImage }
  | { readonly ok: false; readonly message: string };

/** A vector with no intrinsic size still has to be given one. */
const FALLBACK_VECTOR_SIZE = 512;

/**
 * How long to wait for a decode before giving the picture a size anyway.
 *
 * A decode that never settles is not hypothetical — a truncated or malformed
 * file fires neither load nor error on some engines — and an import that hangs
 * for ever is worse than one that guesses the proportions.
 */
export const MEASURE_TIMEOUT_MS = 8000;

/**
 * What a file actually is.
 *
 * Some platforms report no type at all for `.svg`, and refusing on that basis
 * would be refusing a file the user can plainly see is a picture.
 */
export function mediaTypeOf(file: { name: string; type: string }): string {
  if (file.type !== '') return file.type;
  return file.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : '';
}

function describeSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Reads a file as a `data:` URI. */
export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL always yields a string; anything else is a broken reader.
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('The file could not be read as a data URI.'));
    };
    reader.onerror = () => {
      reject(new Error('The file could not be read.'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * The size a picture declares.
 *
 * A vector often declares none — it is meant to take the size it is given — so
 * its `viewBox` is consulted, and failing that it is given a square to start
 * from rather than collapsing to nothing.
 */
export function measureImage(
  source: string,
  mediaType: string,
  timeoutMs = MEASURE_TIMEOUT_MS,
): Promise<ImportedImage> {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;

    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const width = image.naturalWidth;
      const height = image.naturalHeight;

      if (width > 0 && height > 0) {
        resolve({ source, mediaType, naturalWidth: width, naturalHeight: height });
        return;
      }

      const box = mediaType === 'image/svg+xml' ? viewBoxOf(source) : undefined;
      resolve({
        source,
        mediaType,
        naturalWidth: box?.width ?? FALLBACK_VECTOR_SIZE,
        naturalHeight: box?.height ?? FALLBACK_VECTOR_SIZE,
      });
    };

    const timer = setTimeout(settle, timeoutMs);
    image.onload = settle;
    image.onerror = settle;
    image.src = source;
  });
}

/** The proportions a vector declares in its `viewBox`, if it declares any. */
export function viewBoxOf(source: string): { width: number; height: number } | undefined {
  let markup = source;
  const comma = source.indexOf(',');
  if (source.startsWith('data:') && comma >= 0) {
    const payload = source.slice(comma + 1);
    try {
      markup = source.slice(0, comma).includes(';base64')
        ? atob(payload)
        : decodeURIComponent(payload);
    } catch {
      return undefined;
    }
  }

  const match = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(markup);
  if (!match) return undefined;

  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

/** Reads a chosen file, refusing anything this cannot or should not embed. */
export async function importImageFile(
  file: File,
  timeoutMs = MEASURE_TIMEOUT_MS,
): Promise<ImageImportResult> {
  const mediaType = mediaTypeOf(file);

  if (!IMPORTABLE_IMAGE_TYPES.includes(mediaType)) {
    return {
      ok: false,
      message: `${file.name} is not a picture this can import. PNG, JPEG, WebP, GIF, and SVG are.`,
    };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: `${file.name} is ${describeSize(file.size)}. Pictures are stored inside the document, so the limit is ${describeSize(MAX_IMAGE_BYTES)}.`,
    };
  }

  try {
    const source = await readAsDataUrl(file);
    return { ok: true, image: await measureImage(source, mediaType, timeoutMs) };
  } catch {
    return { ok: false, message: `${file.name} could not be read.` };
  }
}
