import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBrowserZoomGuard } from './useBrowserZoomGuard';

/**
 * The gesture that made the application look hung.
 *
 * A pinch over anything that is not the drawing surface — a panel, or a markup
 * block that has taken the pointer — magnified the whole interface. The panels
 * then sit off screen and nothing responds where it used to be.
 */

function Guarded() {
  useBrowserZoomGuard();
  return <div>guarded</div>;
}

function pinch(over: EventTarget, held: 'ctrl' | 'meta' | 'none') {
  const event = new WheelEvent('wheel', {
    deltaY: -120,
    ctrlKey: held === 'ctrl',
    metaKey: held === 'meta',
    bubbles: true,
    cancelable: true,
  });
  over.dispatchEvent(event);
  return event;
}

describe('a zoom gesture anywhere in the application', () => {
  it('is refused, wherever it lands', () => {
    const { container } = render(<Guarded />);

    // A pinch on a trackpad arrives as a wheel with the control key set.
    expect(pinch(container.firstChild as EventTarget, 'ctrl').defaultPrevented).toBe(true);
    expect(pinch(window, 'meta').defaultPrevented).toBe(true);
  });

  it('leaves an ordinary scroll alone', () => {
    // Panels scroll, and pages inside markup blocks scroll.
    render(<Guarded />);

    expect(pinch(window, 'none').defaultPrevented).toBe(false);
  });

  it('stops refusing once the application is gone', () => {
    const { unmount } = render(<Guarded />);
    unmount();

    expect(pinch(window, 'ctrl').defaultPrevented).toBe(false);
  });
});
