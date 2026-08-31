/**
 * The page a markup block is rendered as.
 *
 * Kept apart from the layer that places the blocks so that both can be read —
 * and tested — for what they are: this decides what the browser is asked to
 * render, and the layer decides where it goes.
 */

export function documentFor(html: string, css: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
/*
 * A block sits over the canvas, so it starts transparent — otherwise the
 * shader it was placed on top of is hidden behind a sheet of white.
 *
 * Transparent backgrounds are not enough on their own: a frame is painted on
 * an opaque page base whose colour comes from its colour scheme, and only a
 * document that declares one is left unpainted. Markup that wants a
 * background of its own simply sets one, as it would anywhere.
 */
html { color-scheme: dark; }
html, body { margin: 0; padding: 0; background: transparent; }
body { min-height: 100%; }
${css}
</style>
</head>
<body>
${html}
</body>
</html>`;
}
