import { useEffect } from 'react';

/**
 * Stops the browser magnifying the application.
 *
 * A pinch, or a wheel with the accelerator held, is a zoom gesture — and in a
 * canvas tool it means "zoom the canvas", never "make the whole interface
 * bigger". The canvas already refuses it over the drawing surface, but the
 * gesture can land anywhere: a panel, the toolbar, a markup block that has
 * taken the pointer for itself. Wherever it lands, the browser zooms the page,
 * the panels slide off screen, and the application looks like it has hung.
 *
 * Refused here for the whole window rather than in each of those places, since
 * the answer is the same everywhere and a place that forgets to ask is exactly
 * how this got out once already.
 */
export function useBrowserZoomGuard(): void {
  useEffect(() => {
    const refuse = (event: WheelEvent) => {
      // A pinch on a trackpad arrives as a wheel event with the control key
      // set, whether or not a control key is anywhere near it.
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };

    // Capturing and non-passive: the default has to be refused before anything
    // else decides not to, and a passive listener may not refuse it at all.
    window.addEventListener('wheel', refuse, { passive: false, capture: true });
    return () => {
      window.removeEventListener('wheel', refuse, { capture: true });
    };
  }, []);
}
