import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RenderingPort, RenderScene, RenderViewport, RuntimeStatus } from './renderingPort';

const packageSrc = dirname(dirname(fileURLToPath(import.meta.url)));

function sourceFilesUnder(dir: string): { path: string; source: string }[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFilesUnder(full);
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) return [];
    return [{ path: full.slice(packageSrc.length + 1), source: readFileSync(full, 'utf8') }];
  });
}

/** Source with comments removed, so prose about WebGL is not mistaken for use. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('the port is decoupled from WebGL', () => {
  it('references no WebGL type in its own definition', () => {
    const source = code(readFileSync(join(packageSrc, 'runtime', 'renderingPort.ts'), 'utf8'));

    expect(source).not.toMatch(/WebGL/);
    expect(source).not.toMatch(/\bgl\./);
  });

  it('can be implemented without a graphics context', () => {
    // A complete implementation, written here with no WebGL anywhere.
    let scene: RenderScene = { items: [] };
    let viewport: RenderViewport = { zoom: 1, panX: 0, panY: 0 };
    let frames = 0;

    const fake: RenderingPort = {
      status: { kind: 'ready' } satisfies RuntimeStatus,
      setScene: (next) => {
        scene = next;
      },
      setViewport: (next) => {
        viewport = next;
      },
      resize: () => undefined,
      renderFrame: () => {
        frames += 1;
      },
      dispose: () => undefined,
    };

    fake.setScene({
      items: [
        {
          objectId: 'a',
          shaderId: 'sample',
          values: { speed: 1 },
          transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
          opacity: 1,
        },
      ],
    });
    fake.setViewport({ zoom: 2, panX: -40, panY: 15 });
    fake.renderFrame(0.016);

    expect(scene.items).toHaveLength(1);
    expect(viewport).toEqual({ zoom: 2, panX: -40, panY: 15 });
    expect(frames).toBe(1);
  });
});

describe('the document and registry stay free of WebGL', () => {
  const files = sourceFilesUnder(packageSrc).filter(
    (file) => !file.path.startsWith('runtime/webgl'),
  );

  it('finds the sources to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('$path references no WebGL API', ({ source }) => {
    expect(code(source)).not.toMatch(/WebGL2?RenderingContext/);
    expect(code(source)).not.toMatch(/getContext\(/);
  });
});
