import { IconButton, ThemeProvider, Tooltip, TooltipProvider } from '@shader/design-system';
import './global.css';
import { AppShell } from './shell/AppShell';
import { usePanelLayout } from './shell/usePanelLayout';

const cursorIcon = (
  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
    <path d="M3 2l9 5.5-4 1-2 4.5z" />
  </svg>
);

const squareIcon = (
  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
    <rect height="9" rx="1.5" width="9" x="3.5" y="3.5" />
  </svg>
);

const textIcon = (
  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
    <path d="M4 4h8M8 4v8M6 12h4" />
  </svg>
);

export function App() {
  const { layout, setWidth } = usePanelLayout();

  return (
    <ThemeProvider>
      <TooltipProvider>
        <AppShell
          inspectorPanel={<p>Inspector</p>}
          layout={layout}
          libraryPanel={<p>Shaders</p>}
          onResizePanel={setWidth}
          stage={<p>Canvas</p>}
          toolbar={
            <>
              <Tooltip content="Select" shortcut="V">
                <IconButton icon={cursorIcon} label="Select tool" selected />
              </Tooltip>
              <Tooltip content="Shape" shortcut="R">
                <IconButton icon={squareIcon} label="Shape tool" />
              </Tooltip>
              <Tooltip content="Text" shortcut="T">
                <IconButton icon={textIcon} label="Text tool" />
              </Tooltip>
            </>
          }
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
