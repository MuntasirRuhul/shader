import {
  addObjects,
  createDocument,
  createFrame,
  createHtml,
  createRectangle,
  resetObjectIds,
} from '@shader/core';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { INITIAL_VIEWPORT } from '../store/slices';
import { buildScene } from './buildScene';
import { documentFor, isWholeDocument } from './htmlDocument';
import { HtmlLayer } from './HtmlLayer';

/**
 * Markup on the canvas.
 *
 * It is the one kind of object this application does not draw: laying out HTML
 * is the browser's work, so a block is a real frame placed over the canvas
 * through the same view everything else is placed by.
 */

const block = createHtml('<h1>Hello</h1>', 'h1 { color: red; }', {
  id: 'block',
  name: 'Headline',
  x: 100,
  y: 50,
  width: 400,
  height: 200,
});

beforeEach(() => {
  resetObjectIds();
});

describe('the page a block is rendered as', () => {
  it('carries the markup and the styles that were written', () => {
    const page = documentFor('<h1>Hello</h1>', 'h1 { color: red; }');

    expect(page).toContain('<h1>Hello</h1>');
    expect(page).toContain('h1 { color: red; }');
  });

  it('starts transparent, so what is beneath still shows', () => {
    // A block over a shader must not arrive as a sheet of white.
    const page = documentFor('', '');

    expect(page).toContain('background: transparent');
    // Transparency alone is not enough: a frame is painted on a page base
    // whose colour comes from the colour scheme it declares.
    expect(page).toContain('color-scheme');
  });

  it('lets the markup set a background of its own', () => {
    const page = documentFor('<div></div>', 'body { background: #fff; }');

    // The block's own styles come last, so they win.
    expect(page.indexOf('body { background: #fff; }')).toBeGreaterThan(
      page.indexOf('background: transparent'),
    );
  });
});

describe('placing the blocks', () => {
  it('renders one frame per block, titled by the object', () => {
    const document_ = createDocument({ objects: [block] });

    render(<HtmlLayer document={document_} viewport={INITIAL_VIEWPORT} />);

    expect(screen.getByTitle('Headline')).toBeInTheDocument();
  });

  it('never lets pasted markup reach the application', () => {
    // Scripts may run — that is the point of a live block — but they get an
    // opaque origin, so they cannot read this document or its storage.
    const document_ = createDocument({ objects: [block] });

    render(<HtmlLayer document={document_} viewport={INITIAL_VIEWPORT} />);

    const sandbox = screen.getByTitle('Headline').getAttribute('sandbox');
    expect(sandbox).toBe('allow-scripts');
  });

  it('sizes a block in canvas units and magnifies it, rather than relaying it out', () => {
    // A card 400 wide stays 400 wide when the view zooms: it gets bigger, it
    // does not reflow into a different design.
    const document_ = createDocument({ objects: [block] });

    render(
      <HtmlLayer
        document={document_}
        viewport={{ ...INITIAL_VIEWPORT, zoom: 2, panX: 0, panY: 0 }}
      />,
    );

    const frame = screen.getByTitle('Headline');
    expect(frame).toHaveStyle({ width: '400px', height: '200px' });
    expect(frame.getAttribute('style')).toContain('scale(2)');
  });

  it('leaves out a hidden block, and one inside a hidden container', () => {
    const hidden = createHtml('<p>gone</p>', '', { id: 'hidden', name: 'Hidden', visible: false });
    const frame = createFrame({ id: 'frame', visible: false });
    const inside = createHtml('<p>also gone</p>', '', {
      id: 'inside',
      name: 'Inside',
      parentId: 'frame',
    });
    const document_ = createDocument({ objects: [block, hidden, frame, inside] });

    render(<HtmlLayer document={document_} viewport={INITIAL_VIEWPORT} />);

    expect(screen.getByTitle('Headline')).toBeInTheDocument();
    expect(screen.queryByTitle('Hidden')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Inside')).not.toBeInTheDocument();
  });

  it('renders nothing at all when there is no markup on the canvas', () => {
    const document_ = createDocument({ objects: [createRectangle({ id: 'a' })] });

    const { container } = render(<HtmlLayer document={document_} viewport={INITIAL_VIEWPORT} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('what the renderer is asked to draw', () => {
  it('leaves markup out of the scene', () => {
    // Drawing it as well would put a solid fill behind every block.
    const document_ = addObjects(createDocument(), [block, createRectangle({ id: 'shape' })]);

    const drawn = buildScene(document_).items.map((item) => item.objectId);

    expect(drawn).toEqual(['shape']);
  });
});

describe('a whole page pasted in', () => {
  const page = `<!DOCTYPE html>
<html lang="en">
<head><title>Landing</title><style>body { background: #101223; }</style></head>
<body><h1>Elevate</h1></body>
</html>`;

  it('is kept whole rather than buried in another page', () => {
    // Nesting it renders — browsers are forgiving — but the head, the page's
    // own base styles and its viewport meta are quietly discarded, and it
    // comes out looking not quite like the page it came from.
    const rendered = documentFor(page, '');

    expect(rendered.match(/<html/gi)).toHaveLength(1);
    expect(rendered.match(/<body/gi)).toHaveLength(1);
    expect(rendered).toContain('<title>Landing</title>');
  });

  it('still starts transparent, and still lets the page override that', () => {
    const rendered = documentFor(page, '');

    expect(rendered).toContain('background: transparent');
    expect(rendered.indexOf('background: #101223')).toBeGreaterThan(
      rendered.indexOf('background: transparent'),
    );
  });

  it('applies what the CSS tab holds on top of it', () => {
    const rendered = documentFor(page, 'h1 { color: red; }');

    expect(rendered).toContain('h1 { color: red; }');
  });

  it('is recognised however it is written', () => {
    expect(isWholeDocument('<!DOCTYPE html><html></html>')).toBe(true);
    expect(isWholeDocument('\n  <html lang="en">')).toBe(true);
    expect(isWholeDocument('<div>a fragment</div>')).toBe(false);
    expect(isWholeDocument('<p>with a <html> word in it</p>')).toBe(false);
  });

  it('gives a page with no head somewhere to put the styles', () => {
    const bodyOnly = '<!doctype html><body><p>hello</p></body>';

    const rendered = documentFor(bodyOnly, '');

    expect(rendered).toContain('color-scheme');
    expect(rendered).toContain('<p>hello</p>');
  });
});
