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
import { ShaderLibrary } from './panels/ShaderLibrary';
import { libraryShaders, registry } from './shaders/registry';
import { AppShell } from './shell/AppShell';
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

export function App() {
  const { layout, setWidth } = usePanelLayout();
  const document = useEditorStore((state) => state.document);
  const tool = useEditorStore((state) => state.tool.active);
  const setTool = useEditorStore((state) => state.setTool);
  const addObject = useEditorStore((state) => state.addObject);
  const selection = useEditorStore((state) => state.selection);
  const setFill = useEditorStore((state) => state.setFill);

  const placeShader = (manifest: ShaderManifest, preset: ShaderPreset) => {
    const fill = shaderFill(manifest.id, resolvePreset(manifest, preset.id), preset.id);

    // With something selected, the choice applies to it — which is how a
    // shader gets onto a shape or into text. Otherwise it places a new object.
    if (selection.length > 0) {
      for (const objectId of selection) setFill(objectId, fill);
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
          stage={<CanvasStage registry={registry} />}
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
            </>
          }
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
