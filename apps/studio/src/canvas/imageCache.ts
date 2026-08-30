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
    const existing = this.entries.get(object.id);

    if (!existing || existing.source !== object.source) {
      this.decode(object);
      return undefined;
    }
    if (existing.failed || !existing.image) return undefined;

    if (!isVectorImage(object)) {
      return { source: existing.image, revision: existing.revision };
    }

    return this.rasterized(object, existing, zoom, devicePixelRatio);
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

  private decode(object: ImageObject): void {
    const entry: Entry = { revision: 0, source: object.source, failed: false };
    this.entries.set(object.id, entry);

    const image = new Image();
    // A data URI is same-origin, but a decoded picture drawn to a canvas taints
    // it otherwise, and rasterizing a vector needs an untainted canvas.
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';

    image.onload = () => {
      // The object may have been given a different file while this decoded.
      if (this.entries.get(object.id) !== entry) return;
      entry.image = image;
      entry.revision += 1;
      this.onReady();
    };
    image.onerror = () => {
      if (this.entries.get(object.id) !== entry) return;
      entry.failed = true;
      this.onReady();
    };

    image.src = object.source;
  }

  /** Forgets pictures for objects the document no longer contains. */
  retainOnly(objectIds: Iterable<string>): void {
    const live = new Set(objectIds);
    for (const id of [...this.entries.keys()]) {
      if (!live.has(id)) this.entries.delete(id);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
