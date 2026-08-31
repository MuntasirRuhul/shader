import {
  createRectangle,
  resolvePreset,
  shaderFill,
  type ShaderManifest,
  type ShaderPreset,
} from '@shader/core';
import { IconButton, ThemeProvider, Tooltip, TooltipProvider } from '@shader/design-system';
import './global.css';
import { CanvasStage } from './canvas/CanvasStage';
import { Inspector } from './inspector/Inspector';
import { CodePanel } from './panels/CodePanel';
import { ShaderLibrary } from './panels/ShaderLibrary';
import { ImageImport } from './persistence/ImageImport';
import { useDocumentPersistence } from './persistence/useDocumentPersistence';
import { libraryShaders, registry } from './shaders/registry';
import { AppShell } from './shell/AppShell';
import { useBrowserZoomGuard } from './shell/useBrowserZoomGuard';
import { usePanelLayout } from './shell/usePanelLayout';
import { useEditorStore } from './store/editorStore';

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

const undoIcon = (
  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
    <path d="M6 4L3 7l3 3" />
    <path d="M3 7h6.5a3.5 3.5 0 010 7H7" />
  </svg>
);

const redoIcon = (
  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
    <path d="M10 4l3 3-3 3" />
    <path d="M13 7H6.5a3.5 3.5 0 000 7H9" />
  </svg>
);

const groupIcon = (
  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
    <rect height="6" rx="1" width="6" x="2.5" y="2.5" />
    <rect height="6" rx="1" width="6" x="7.5" y="7.5" />
  </svg>
);

const ungroupIcon = (
  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
    <rect height="5" rx="1" width="5" x="1.5" y="1.5" />
    <rect height="5" rx="1" width="5" x="9.5" y="9.5" />
    <path d="M7 4.5h3.5M5.5 7v3.5" />
  </svg>
);

const panelsIcon = (
  <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
    <rect height="10" rx="1.5" width="12" x="2" y="3" />
    <path d="M6 3v10M10 3v10" />
  </svg>
);

export function App() {
  const { layout, setWidth, chromeHidden, toggleChrome } = usePanelLayout();
  useBrowserZoomGuard();
  useDocumentPersistence();
  const document = useEditorStore((state) => state.document);
  const tool = useEditorStore((state) => state.tool.active);
  const setTool = useEditorStore((state) => state.setTool);
  const addObject = useEditorStore((state) => state.addObject);
  const selection = useEditorStore((state) => state.selection);
  const setFill = useEditorStore((state) => state.setFill);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const canUndo = useEditorStore((state) => state.history.past.length > 0);
  const canRedo = useEditorStore((state) => state.history.future.length > 0);
  const groupSelection = useEditorStore((state) => state.groupSelection);
  const ungroupSelection = useEditorStore((state) => state.ungroupSelection);
  const canGroup = selection.length > 1;
  const canUngroup = document.objects.some(
    (object) => selection.includes(object.id) && object.type === 'frame',
  );

  const placeShader = (manifest: ShaderManifest, preset: ShaderPreset) => {
    const fill = shaderFill(manifest.id, resolvePreset(manifest, preset.id), preset.id);

    // A markup block draws itself, so a fill under it is a colour nobody can
    // ever see: choosing a shader with one selected means "put this on the
    // canvas", not "fill the block with it".
    const fillable = document.objects.filter(
      (object) => selection.includes(object.id) && object.type !== 'html',
    );

    // With something selected, the choice applies to it — which is how a
    // shader gets onto a shape or into text. Otherwise it places a new object.
    if (fillable.length > 0) {
      for (const object of fillable) setFill(object.id, fill);
      return;
    }

    // Cascade successive placements so a new object does not land exactly on
    // the previous one and appear to replace it.
    const step = (document.objects.length % 6) * 32;

    addObject(
      createRectangle({
        name: preset.name,
        x: 120 + step,
        y: 100 + step,
        width: 480,
        height: 320,
        fill,
      }),
    );
  };

  return (
    <ThemeProvider>
      <TooltipProvider>
        <AppShell
          inspectorPanel={<Inspector defaultShaderId="gradient-blur" registry={registry} />}
          layout={layout}
          libraryPanel={<ShaderLibrary onChoose={placeShader} shaders={libraryShaders()} />}
          onResizePanel={setWidth}
          stage={<CanvasStage onToggleChrome={toggleChrome} registry={registry} />}
          toolbar={
            <>
              <Tooltip content="Select" shortcut="V">
                <IconButton
                  icon={cursorIcon}
                  label="Select tool"
                  onClick={() => {
                    setTool('select');
                  }}
                  selected={tool === 'select'}
                />
              </Tooltip>
              <Tooltip content="Shape" shortcut="R">
                <IconButton
                  icon={squareIcon}
                  label="Shape tool"
                  onClick={() => {
                    setTool('shape');
                  }}
                  selected={tool === 'shape'}
                />
              </Tooltip>
              <Tooltip content="Text" shortcut="T">
                <IconButton
                  icon={textIcon}
                  label="Text tool"
                  onClick={() => {
                    setTool('text');
                  }}
                  selected={tool === 'text'}
                />
              </Tooltip>

              <Tooltip content="Group" shortcut="⌘G">
                <IconButton
                  disabled={!canGroup}
                  icon={groupIcon}
                  label="Group"
                  onClick={groupSelection}
                />
              </Tooltip>
              <Tooltip content="Ungroup" shortcut="⇧⌘G">
                <IconButton
                  disabled={!canUngroup}
                  icon={ungroupIcon}
                  label="Ungroup"
                  onClick={ungroupSelection}
                />
              </Tooltip>

              <ImageImport />

              <CodePanel />

              <Tooltip content="Undo" shortcut="⌘Z">
                <IconButton disabled={!canUndo} icon={undoIcon} label="Undo" onClick={undo} />
              </Tooltip>
              <Tooltip content="Redo" shortcut="⇧⌘Z">
                <IconButton disabled={!canRedo} icon={redoIcon} label="Redo" onClick={redo} />
              </Tooltip>
              <Tooltip content={chromeHidden ? 'Show panels' : 'Hide panels'} shortcut="\\">
                <IconButton
                  icon={panelsIcon}
                  label={chromeHidden ? 'Show panels' : 'Hide panels'}
                  onClick={toggleChrome}
                  selected={chromeHidden}
                />
              </Tooltip>
            </>
          }
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
