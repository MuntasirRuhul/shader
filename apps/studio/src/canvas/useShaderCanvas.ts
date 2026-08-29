import {
  acquireContext,
  AnimationLoop,
  WebGlRenderer,
  type CanvasDocument,
  type RuntimeStatus,
  type ShaderCompileFailure,
  type ShaderRegistry,
} from '@shader/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildScene } from './buildScene';
import { TextMaskCache } from './textRasterizer';

export interface ShaderCanvasOptions {
  readonly document: CanvasDocument;
  readonly registry: Pick<ShaderRegistry, 'get'>;
  /** Text masks are rendered for the current magnification. */
  readonly zoom?: number;
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
  const zoomRef = useRef(options.zoom ?? 1);
  zoomRef.current = options.zoom ?? 1;
  const failureRef = useRef(options.onCompileFailure);
  failureRef.current = options.onCompileFailure;

  /** The scene for the current document, with text masks attached. */
  const sceneFor = useCallback((document: CanvasDocument) => {
    const masks = masksRef.current;
    const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio;

    const scene = buildScene(document, {
      maskFor: (object) =>
        object.type === 'text' ? masks.maskFor(object, zoomRef.current, ratio) : undefined,
    });

    // Drop masks for objects the scene no longer contains.
    masks.retainOnly(document.objects.map((object) => object.id));
    return scene;
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
      rendererRef.current = renderer;

      const loop = new AnimationLoop({
        render: (elapsed) => {
          renderer.renderFrame(elapsed);
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
  useEffect(() => {
    const renderer = rendererRef.current;
    const loop = loopRef.current;
    if (!renderer || !loop) return;

    renderer.setScene(sceneFor(options.document));
    loop.reconcile();
    if (!loop.isRunning) loop.renderOnce();
  }, [options.document, options.zoom, sceneFor]);

  useEffect(() => teardown, [teardown]);

  const requestFrame = useCallback(() => {
    loopRef.current?.renderOnce();
  }, []);

  return { canvasRef: attach, status, requestFrame };
}
