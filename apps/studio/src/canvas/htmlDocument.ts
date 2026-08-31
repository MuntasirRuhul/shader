/**
 * The page a markup block is rendered as.
 *
 * Kept apart from the layer that places the blocks so that both can be read —
 * and tested — for what they are: this decides what the browser is asked to
 * render, and the layer decides where it goes.
 */

/**
 * What every block is rendered on top of.
 *
 * A block sits over the canvas, so it starts transparent — otherwise the
 * shader it was placed on is hidden behind a sheet of white. Transparent
 * backgrounds are not enough on their own: a frame is painted on an opaque
 * page base whose colour comes from the colour scheme it declares, and only a
 * document that declares one is left unpainted. Markup that wants a background
 * of its own simply sets one, as it would anywhere.
 */
const BASE_STYLE = `
html { color-scheme: dark; }
html, body { margin: 0; padding: 0; background: transparent; }
body { min-height: 100%; }`;

/**
 * Whether what was pasted is a whole page rather than a fragment.
 *
 * This is the difference between "here is my markup" and "here is my site",
 * and pasting a site is the thing this panel exists for. A whole page put
 * inside another page's body renders — browsers are forgiving — but its head,
 * its own base styles and its viewport meta are all quietly discarded, which
 * is why it comes out looking not quite like the page it came from.
 */
export function isWholeDocument(html: string): boolean {
  const start = html.trimStart().toLowerCase();
  return start.startsWith('<!doctype') || start.startsWith('<html');
}

/** The styles a block always carries, followed by whatever it declares. */
function styleBlock(css: string): string {
  return `<style>${BASE_STYLE}\n${css}\n</style>`;
}

/**
 * The page to render for a block: what was written, made a document.
 *
 * A whole page is kept whole, with the base styles and anything from the CSS
 * tab put into its head; a fragment is given a document to live in.
 */
export function documentFor(html: string, css: string): string {
  if (isWholeDocument(html)) {
    const style = styleBlock(css);

    // Into the head, so a page's own rules still come after the base ones and
    // win. A document without a head gets the styles ahead of everything,
    // which is the same order.
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (tag) => `${tag}\n${style}`);
    if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (tag) => `${style}\n${tag}`);
    return `${style}\n${html}`;
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
${styleBlock(css)}
</head>
<body>
${html}
</body>
</html>`;
}
