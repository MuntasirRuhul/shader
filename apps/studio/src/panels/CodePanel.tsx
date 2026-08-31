import { createHtml, isHtmlObject } from '@shader/core';
import { IconButton, Popover, Tooltip } from '@shader/design-system';
import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import styles from './CodePanel.module.css';

/**
 * Writing markup, and seeing it on the canvas.
 *
 * The panel edits whichever markup block is selected, and creates one when
 * none is. What is typed reaches the document a moment after typing stops
 * rather than on every keystroke: each change reloads the block's frame, and
 * reloading it per character makes the canvas flicker and loses the caret in
 * anything the markup itself is running.
 */

const codeIcon = (
  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
    <path d="M6 4.5L2.5 8 6 11.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 4.5L13.5 8 10 11.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** What a new block starts as: enough to show that it is working. */
const STARTER_HTML = `<div class="card">
  <h1>Impossible to ignore.</h1>
  <p>Paste your own markup here.</p>
</div>`;

const STARTER_CSS = `.card {
  padding: 32px;
  font-family: -apple-system, Inter, Segoe UI, sans-serif;
  color: #f4f4f0;
}

h1 {
  margin: 0 0 8px;
  font-size: 34px;
  line-height: 1.1;
}

p {
  margin: 0;
  color: #9b9ba3;
}`;

/** How long after the last keystroke the canvas is redrawn. */
const SETTLE_MS = 400;

type Tab = 'html' | 'css';

export function CodePanel() {
  const document = useEditorStore((state) => state.document);
  const selection = useEditorStore((state) => state.selection);

  const selected = document.objects.find((object) => object.id === selection[0]);
  const block = selected && isHtmlObject(selected) ? selected : undefined;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('html');
  const [html, setHtml] = useState(block?.html ?? STARTER_HTML);
  const [css, setCss] = useState(block?.css ?? STARTER_CSS);

  /** The block these drafts belong to, so switching selection reloads them. */
  const editingRef = useRef<string | undefined>(block?.id);
  if (editingRef.current !== block?.id) {
    editingRef.current = block?.id;
    setHtml(block?.html ?? STARTER_HTML);
    setCss(block?.css ?? STARTER_CSS);
  }

  // Settle, then write. Nothing is written when the text matches what the
  // block already holds, so opening the panel is not itself an edit.
  useEffect(() => {
    if (!block) return;
    if (block.html === html && block.css === css) return;

    const timer = setTimeout(() => {
      useEditorStore.getState().updateObject(block.id, { html, css }, 'Edit markup');
    }, SETTLE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [block, html, css]);

  const addBlock = () => {
    const state = useEditorStore.getState();
    // Cascade successive blocks so a new one does not land exactly on the last.
    const step = (state.document.objects.length % 6) * 32;
    const object = createHtml(html, css, { x: 120 + step, y: 100 + step });

    state.addObject(object);
    state.select(object.id);
  };

  return (
    <Popover
      align="end"
      onOpenChange={setOpen}
      open={open}
      side="top"
      trigger={
        <span>
          <Tooltip content="Markup">
            <IconButton icon={codeIcon} label="Markup" selected={open} />
          </Tooltip>
        </span>
      }
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.tabs} role="tablist">
            <button
              aria-selected={tab === 'html'}
              className={tab === 'html' ? styles.tabSelected : styles.tab}
              onClick={() => {
                setTab('html');
              }}
              role="tab"
              type="button"
            >
              HTML
            </button>
            <button
              aria-selected={tab === 'css'}
              className={tab === 'css' ? styles.tabSelected : styles.tab}
              onClick={() => {
                setTab('css');
              }}
              role="tab"
              type="button"
            >
              CSS
            </button>
          </div>

          <span className={styles.target}>{block ? block.name : 'Not on the canvas yet'}</span>
        </div>

        <textarea
          aria-label={tab === 'html' ? 'HTML' : 'CSS'}
          className={styles.editor}
          onChange={(event) => {
            if (tab === 'html') setHtml(event.target.value);
            else setCss(event.target.value);
          }}
          // The canvas listens for keys of its own — Delete removes the
          // selection, V picks up the select tool — and none of that may
          // happen while somebody is writing markup.
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
          spellCheck={false}
          value={tab === 'html' ? html : css}
        />

        <div className={styles.footer}>
          <p className={styles.note}>
            {block
              ? 'Edits reach the canvas as you stop typing.'
              : 'Nothing selected — this will be placed as a new block.'}
          </p>
          {!block && (
            <button className={styles.place} onClick={addBlock} type="button">
              Place on canvas
            </button>
          )}
        </div>
      </div>
    </Popover>
  );
}
