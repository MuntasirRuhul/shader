import {
  acquireContext,
  AnimationLoop,
  IDENTITY_VIEWPORT,
  WebGlRenderer,
  type CanvasDocument,
  type RenderViewport,
  type RuntimeStatus,
  type ShaderCompileFailure,
  type ShaderRegistry,
} from '@shader/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { onFontsChanged } from '../inspector/fonts';
import { transientChannel, type TransientEdit } from '../store/transientChannel';
import { buildScene } from './buildScene';
import { TextMaskCache } from './textRasterizer';

/** The object properties a canvas drag changes, as opposed to shader values. */
const TRANSFORM_KEYS = ['x', 'y', 'width', 'height', 'rotation'] as const;
type TransformKey = (typeof TRANSFORM_KEYS)[number];

function isTransformKey(key: string): key is TransformKey {
  return (TRANSFORM_KEYS as readonly string[]).includes(key);
}

export interface ShaderCanvasOptions {
  readonly document: CanvasDocument;
  readonly registry: Pick<ShaderRegistry, 'get'>;
  /**
   * How the canvas is being looked at. The renderer places objects through it,
   * so that what is drawn and what is overlaid agree; text masks are also
   * rasterized for the current magnification.
   */
  readonly viewport?: RenderViewport;
  readonly onCompileFailure?: (failure: ShaderCompileFailure) => void;
}

export interface ShaderCanvas {
  /** Attach to the canvas element. */
  readonly canvasRef: (element: HTMLCanvasElement | null) => void;
  readonly status: RuntimeStatus;
  /** Redraws immediately, for a change that does not animate. */
  readonly requestFrame: () => void;
}

/**
 * Owns the rendering surface for the canvas stage.
 *
 * The renderer and the animation loop live outside React: they are created
 * when the canvas element mounts and torn down when it unmounts, and the
 * scene is pushed to them imperatively. React is not on the frame path.
 */
export function useShaderCanvas(options: ShaderCanvasOptions): ShaderCanvas {
  const rendererRef = useRef<WebGlRenderer | null>(null);
  const loopRef = useRef<AnimationLoop | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const masksRef = useRef(new TextMaskCache());

  const [status, setStatus] = useState<RuntimeStatus>({ kind: 'ready' });

  // Held in a ref so the render callback always sees the current document
  // without the loop having to be rebuilt on every edit.
  const documentRef = useRef(options.document);
  documentRef.current = options.document;
  const registryRef = useRef(options.registry);
  registryRef.current = options.registry;
  const viewport = options.viewport ?? IDENTITY_VIEWPORT;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const failureRef = useRef(options.onCompileFailure);
  failureRef.current = options.onCompileFailure;

  /** Values published by an in-progress drag, applied over the document. */
  const transientRef = useRef<readonly TransientEdit[]>([]);

  /** The scene for the current document, with text masks and any live drag. */
  const sceneFor = useCallback((document: CanvasDocument) => {
    const masks = masksRef.current;
    const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio;

    const scene = buildScene(document, {
      maskFor: (object) =>
        object.type === 'text' ? masks.maskFor(object, viewportRef.current.zoom, ratio) : undefined,
    });

    // Drop masks for objects the scene no longer contains.
    masks.retainOnly(document.objects.map((object) => object.id));

    const pending = transientRef.current;
    if (pending.length === 0) return scene;

    // A drag in progress has not reached the document, so its values are laid
    // over the scene here — which is what makes the canvas follow the pointer
    // without a store write per move.
    return {
      items: scene.items.map((item) => {
        const overrides = pending.filter((edit) => edit.objectId === item.objectId);
        if (overrides.length === 0) return item;

        // Dragging an object changes where it is; dragging a control changes
        // what it draws. The two land in different places.
        const values = { ...item.values };
        const transform = { ...item.transform };
        for (const edit of overrides) {
          if (isTransformKey(edit.key)) transform[edit.key] = edit.value as number;
          else values[edit.key] = edit.value as never;
        }

        return { ...item, values, transform };
      }),
    };
  }, []);

  const teardown = useCallback(() => {
    loopRef.current?.dispose();
    loopRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
    observerRef.current?.disconnect();
    observerRef.current = null;
    masksRef.current.clear();
  }, []);

  const attach = useCallback(
    (element: HTMLCanvasElement | null) => {
      if (canvasRef.current === element) return;
      teardown();
      canvasRef.current = element;
      if (!element) return;

      const context = acquireContext(element);
      if (!context.ok) {
        setStatus({ kind: 'unsupported', reason: context.reason });
        return;
      }

      const renderer = new WebGlRenderer({
        gl: context.gl,
        surface: element,
        registry: registryRef.current,
        devicePixelRatio: () => window.devicePixelRatio,
        observer: {
          onStatusChange: setStatus,
          onCompileFailure: (failure) => failureRef.current?.(failure),
        },
      });
      renderer.setViewport(viewportRef.current);
      rendererRef.current = renderer;

      const loop = new AnimationLoop({
        render: (elapsed, dt) => {
          // `dt` is what every simulation on the canvas steps by; dropping it
          // would leave them frozen on their first frame.
          renderer.renderFrame(elapsed, dt);
        },
        needsAnimation: () => renderer.hasAnimatedContent,
      });
      loopRef.current = loop;

      // The drawing buffer follows the element's CSS size.
      const resize = () => {
        const rect = element.getBoundingClientRect();
        renderer.resize(rect.width, rect.height);
        loop.renderOnce();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(element);
      observerRef.current = observer;

      renderer.setScene(sceneFor(documentRef.current));
      resize();
      loop.reconcile();

      // The driver can take the context away at any time; both events must be
      // handled or the canvas silently stops working.
      element.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        renderer.handleContextLost();
      });
      element.addEventListener('webglcontextrestored', () => {
        renderer.handleContextRestored();
        renderer.setScene(sceneFor(documentRef.current));
        loop.reconcile();
        loop.renderOnce();
      });
    },
    [sceneFor, teardown],
  );

  // Push the scene whenever the document changes, and draw once so a still
  // shader reflects the edit even while the loop is idle.
  //
  // Magnification is a dependency because a text mask is rasterized for it: a
  // magnified glyph run has to be re-rendered, not enlarged. Panning is not,
  // which is why it is a separate effect below.
  useEffect(() => {
    const renderer = rendererRef.current;
    const loop = loopRef.current;
    if (!renderer || !loop) return;

    renderer.setScene(sceneFor(options.document));
    loop.reconcile();
    if (!loop.isRunning) loop.renderOnce();
  }, [options.document, viewport.zoom, sceneFor]);

  // Push the view on its own. A pan is a redraw, not a document change, so it
  // rebuilds no scene and re-examines no resource.
  useEffect(() => {
    const renderer = rendererRef.current;
    const loop = loopRef.current;
    if (!renderer || !loop) return;

    renderer.setViewport(viewport);
    if (!loop.isRunning) loop.renderOnce();
  }, [viewport]);

  // Redraw on every value a drag publishes. React is not involved.
  useEffect(
    () =>
      transientChannel.subscribe((edits) => {
        transientRef.current = edits;
        const renderer = rendererRef.current;
        const loop = loopRef.current;
        if (!renderer || !loop) return;

        renderer.setScene(sceneFor(documentRef.current));
        if (!loop.isRunning) loop.renderOnce();
      }),
    [sceneFor],
  );

  // A webfont arrives after the text that wants it. Everything rasterized in
  // the fallback has to be rasterized again, or it stays wrong for good.
  useEffect(
    () =>
      onFontsChanged(() => {
        const renderer = rendererRef.current;
        const loop = loopRef.current;
        if (!renderer || !loop) return;

        masksRef.current.clear();
        renderer.setScene(sceneFor(documentRef.current));
        if (!loop.isRunning) loop.renderOnce();
      }),
    [sceneFor],
  );

  useEffect(() => teardown, [teardown]);

  const requestFrame = useCallback(() => {
    loopRef.current?.renderOnce();
  }, []);

  return { canvasRef: attach, status, requestFrame };
}
