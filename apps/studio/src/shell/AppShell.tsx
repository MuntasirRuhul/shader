import type { CSSProperties, ReactNode } from 'react';
import styles from './AppShell.module.css';
import { PanelResizer } from './PanelResizer';
import { DEFAULT_PANEL_LAYOUT, type PanelLayout, type PanelSide } from './panelState';

export interface AppShellProps {
  /** Left region: the shader library. */
  readonly libraryPanel: ReactNode;
  /** Center region: the canvas. */
  readonly stage: ReactNode;
  /** Right region: the inspector. */
  readonly inspectorPanel: ReactNode;
  /** Floats over the stage, centered near its lower edge. */
  readonly toolbar?: ReactNode;
  /** Panel widths and collapse state. Owned by the caller so it can persist. */
  readonly layout?: PanelLayout;
  readonly onResizePanel?: (side: PanelSide, width: number) => void;
}

function widthStyle(width: number): CSSProperties {
  return { width: `${String(width)}px` };
}

/**
 * The application frame: a left panel, a center stage that absorbs the
 * remaining width, and a right panel, with an optional toolbar floating over
 * the stage.
 *
 * Every region is injected. The shell knows nothing about what fills them, so
 * substituting a region's content changes nothing here.
 */
export function AppShell({
  libraryPanel,
  stage,
  inspectorPanel,
  toolbar,
  layout = DEFAULT_PANEL_LAYOUT,
  onResizePanel,
}: AppShellProps) {
  const renderPanel = (
    side: PanelSide,
    label: string,
    content: ReactNode,
    resizerLabel: string,
  ) => {
    const state = layout[side];
    if (state.collapsed) return null;

    const isStart = side === 'library';
    return (
      <aside
        aria-label={label}
        className={`${styles.panel} ${isStart ? styles.panelStart : styles.panelEnd}`}
        style={widthStyle(state.width)}
      >
        <div className={styles.panelBody}>{content}</div>
        {onResizePanel && (
          <PanelResizer
            label={resizerLabel}
            onResize={(width) => {
              onResizePanel(side, width);
            }}
            side={side}
            width={state.width}
          />
        )}
      </aside>
    );
  };

  return (
    <div className={styles.shell}>
      {renderPanel('library', 'Shader library', libraryPanel, 'Resize shader library')}

      <main aria-label="Canvas" className={styles.stage}>
        <div className={styles.stageContent}>{stage}</div>
        {toolbar !== undefined && (
          <div className={styles.toolbar}>
            <div aria-label="Canvas tools" className={styles.toolbarInner} role="toolbar">
              {toolbar}
            </div>
          </div>
        )}
      </main>

      {renderPanel('inspector', 'Inspector', inspectorPanel, 'Resize inspector')}
    </div>
  );
}
