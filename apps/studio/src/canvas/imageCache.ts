import { isVectorImage, type ImageObject } from '@shader/core';
import { maskScaleFor } from './textRasterizer';

/**
 * Decoding imported pictures, and keeping them ready to upload.
 *
 * Decoding is asynchronous and uploading is not, so a picture cannot simply be
 * fetched when it is needed: the frame that wants it has already been drawn.
 * A picture is therefore absent until it has decoded, and its arrival is
 * announced so the frame can be drawn again.
 *
 * Vector sources are rasterized rather than uploaded, at the magnification
 * they are being viewed at — the whole point of a vector being that it has no
 * resolution of its own until something decides on one.
 */

export interface ReadyImage {
  readonly source: CanvasImageSource & TexImageSource;
  readonly revision: number;
}

interface Entry {
  /** The object this picture belongs to, so it is dropped when that goes. */
  readonly owner: string;
  /** What was decoded, once it has been. */
  image?: HTMLImageElement;
  /** The rasterization a vector was last drawn at, and at what scale. */
  raster?: { canvas: HTMLCanvasElement; key: string };
  revision: number;
  /** The source this entry decoded, so a changed one is decoded again. */
  readonly source: string;
  failed: boolean;
}

export class ImageCache {
  private readonly entries = new Map<string, Entry>();

  /** Told when a picture has decoded, so the canvas can draw it. */
  constructor(private readonly onReady: () => void = () => undefined) {}

  get size(): number {
    return this.entries.size;
  }

  /**
   * The picture to upload for an object, or nothing while it is still
   * decoding — or if it never will, which a corrupt file makes possible.
   */
  sourceFor(object: ImageObject, zoom: number, devicePixelRatio = 1): ReadyImage | undefined {
    const existing = this.decoded(object.id, object.id, object.source);
    if (!existing) return undefined;

    if (!isVectorImage(object)) {
      return { source: existing.image, revision: existing.revision };
    }

    return this.rasterized(object, existing, zoom, devicePixelRatio);
  }

  /**
   * The picture a shader's image parameter points at, once it has decoded.
   *
   * Uploaded as it arrived rather than rasterized for the current zoom: a
   * shader samples a picture as texture, and what it wants is the pixels, not
   * a rendering of them at the size the object happens to be on screen.
   */
  parameterSource(owner: string, key: string, source: string): ReadyImage | undefined {
    const entry = this.decoded(owner, key, source);
    return entry ? { source: entry.image, revision: entry.revision } : undefined;
  }

  /**
   * The decoded entry for a key, starting a decode when there is none or when
   * the source has been replaced. Absent while it decodes, and for good if it
   * cannot be decoded at all.
   */
  private decoded(
    owner: string,
    key: string,
    source: string,
  ): (Entry & { image: HTMLImageElement }) | undefined {
    const existing = this.entries.get(key);

    if (!existing || existing.source !== source) {
      this.decode(owner, key, source);
      return undefined;
    }
    if (existing.failed || !existing.image) return undefined;

    return existing as Entry & { image: HTMLImageElement };
  }

  /**
   * A vector drawn at the size it is being viewed at.
   *
   * Uploading the vector's own dimensions would fix its resolution at whatever
   * the file happened to declare, which for a drawing meant to scale is an
   * arbitrary number.
   */
  private rasterized(
    object: ImageObject,
    entry: Entry,
    zoom: number,
    devicePixelRatio: number,
  ): ReadyImage | undefined {
    const scale = maskScaleFor(zoom, devicePixelRatio, object);
    const key = `${String(object.width)} ${String(object.height)} ${String(scale)}`;
    if (entry.raster?.key === key) {
      return { source: entry.raster.canvas, revision: entry.revision };
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(object.width * scale));
    canvas.height = Math.max(1, Math.round(object.height * scale));

    const context = canvas.getContext('2d');
    if (!context || !entry.image) return undefined;
    context.drawImage(entry.image, 0, 0, canvas.width, canvas.height);

    entry.raster = { canvas, key };
    entry.revision += 1;
    return { source: canvas, revision: entry.revision };
  }

  private decode(owner: string, key: string, source: string): void {
    const entry: Entry = { owner, revision: 0, source, failed: false };
    this.entries.set(key, entry);

    // A `data:` URI carries its own bytes, so there is no origin to negotiate
    // and nothing to taint a canvas with. Asking for CORS anyway makes some
    // engines refuse the load outright.
    const image = new Image();
    image.decoding = 'async';

    image.onload = () => {
      // The object may have been given a different file while this decoded.
      if (this.entries.get(key) !== entry) return;
      entry.image = image;
      entry.revision += 1;
      this.onReady();
    };
    image.onerror = () => {
      if (this.entries.get(key) !== entry) return;
      entry.failed = true;
      this.onReady();
    };

    image.src = source;
  }

  /** Forgets pictures for objects the document no longer contains. */
  retainOnly(objectIds: Iterable<string>): void {
    const live = new Set(objectIds);
    for (const [key, entry] of [...this.entries]) {
      if (!live.has(entry.owner)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
