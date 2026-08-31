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

/** Marks what this application put into a block, so it can take it out again. */
export const INJECTED_ATTRIBUTE = 'data-shader-builder';

/** What the page and the application say to each other. */
export const EDIT_MESSAGE = 'shader-builder:edit';
export const HTML_MESSAGE = 'shader-builder:html';
export const READY_MESSAGE = 'shader-builder:ready';
export const WHEEL_MESSAGE = 'shader-builder:wheel';

/**
 * The agent that makes a block editable from the canvas.
 *
 * It runs *inside* the block, which is the only thing that can: the frame is
 * sandboxed without same-origin access, so this application cannot read or
 * write the page's contents itself — by design, since the markup is pasted
 * from anywhere and may run scripts of its own. What it can do is talk. The
 * agent turns editing on when asked, and posts back the page as it now stands.
 *
 * It removes everything this application injected before posting, so what
 * comes back is the user's own markup rather than ours accumulated a copy at
 * a time.
 */
function agentScript(whole: boolean): string {
  return `<script ${INJECTED_ATTRIBUTE}="agent">
(function () {
  var settle;

  function currentHtml() {
    var root = document.documentElement.cloneNode(true);
    var injected = root.querySelectorAll('[${INJECTED_ATTRIBUTE}]');
    for (var i = 0; i < injected.length; i++) injected[i].remove();
    var body = root.querySelector('body');
    if (body) body.removeAttribute('contenteditable');
    return ${whole ? "'<!doctype html>\\n' + root.outerHTML" : "(body ? body.innerHTML : '')"};
  }

  function report() {
    clearTimeout(settle);
    settle = setTimeout(function () {
      parent.postMessage({ kind: '${HTML_MESSAGE}', html: currentHtml() }, '*');
    }, 400);
  }

  var editing = false;

  // A zoom gesture over a block being edited would otherwise magnify the
  // whole application: the wheel belongs to this page, and nothing outside it
  // ever sees the event to refuse it. So the page refuses it, and hands the
  // gesture to the canvas — which is what the pointer was over.
  addEventListener(
    'wheel',
    function (event) {
      if (!editing || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      parent.postMessage(
        { kind: '${WHEEL_MESSAGE}', deltaY: event.deltaY, x: event.clientX, y: event.clientY },
        '*',
      );
    },
    { passive: false },
  );

  addEventListener('message', function (event) {
    if (!event.data || event.data.kind !== '${EDIT_MESSAGE}') return;
    editing = Boolean(event.data.editing);
    document.body.contentEditable = event.data.editing ? 'true' : 'false';
    if (!event.data.editing) return;

    document.body.focus();
    // Focus alone leaves no caret, and typing with nowhere to put the
    // characters drops them. One is placed at the start, and clicking anywhere
    // in the page moves it where it is wanted.
    var selection = getSelection();
    if (selection && selection.rangeCount === 0) {
      var range = document.createRange();
      range.selectNodeContents(document.body);
      range.collapse(true);
      selection.addRange(range);
    }
  });

  addEventListener('input', report);

  // A page takes a moment to load, and the request to become editable may
  // arrive before there is anything here to receive it. Saying so on arrival
  // lets it be asked again, rather than the block quietly refusing to edit.
  parent.postMessage({ kind: '${READY_MESSAGE}' }, '*');
  // A block is edited by typing into it, and typing is what \`input\` reports;
  // anything else the page does to itself is its own business.
})();
</script>`;
}

/** The styles a block always carries, followed by whatever it declares. */
function styleBlock(css: string): string {
  return `<style ${INJECTED_ATTRIBUTE}="style">${BASE_STYLE}\n${css}\n</style>`;
}

/**
 * The page to render for a block: what was written, made a document.
 *
 * A whole page is kept whole, with the base styles and anything from the CSS
 * tab put into its head; a fragment is given a document to live in.
 */
export function documentFor(html: string, css: string): string {
  if (isWholeDocument(html)) {
    const style = `${styleBlock(css)}\n${agentScript(true)}`;

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
${agentScript(false)}
</body>
</html>`;
}
