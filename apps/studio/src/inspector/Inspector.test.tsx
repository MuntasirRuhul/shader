import {
  createRectangle,
  isShaderFill,
  MANIFEST_SCHEMA_VERSION,
  resetObjectIds,
  shaderFill,
  ShaderRegistry,
  solidFill,
  type ShaderManifest,
} from '@shader/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '../store/editorStore';
import { transientChannel } from '../store/transientChannel';
import { Inspector } from './Inspector';

/**
 * A shader defined entirely here, in a test.
 *
 * Nothing in the inspector knows it exists. If its panel renders correctly,
 * the open-closed contract holds: a shader is added by writing a manifest,
 * not by editing the panel.
 */
const inventedManifest: ShaderManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'invented',
  name: 'Invented',
  category: 'Test',
  fragmentSource: 'void main() { outColor = vec4(tint, 1.0); }',
  parameters: [
    {
      name: 'intensity',
      label: 'Intensity',
      type: 'number',
      group: 'Look',
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
    },
    { name: 'tint', label: 'Tint', type: 'color', group: 'Look', defaultValue: '#4d7cff' },
    { name: 'invert', label: 'Invert', type: 'boolean', group: 'Look', defaultValue: false },
    {
      name: 'mode',
      label: 'Mode',
      type: 'enum',
      group: 'Behaviour',
      defaultValue: 'soft',
      options: [
        { value: 'soft', label: 'Soft' },
        { value: 'hard', label: 'Hard' },
      ],
    },
    {
      name: 'origin',
      label: 'Origin',
      type: 'vector2',
      group: 'Behaviour',
      defaultValue: { x: 0.5, y: 0.5 },
      min: { x: 0, y: 0 },
      max: { x: 1, y: 1 },
      step: 0.01,
    },
    {
      name: 'stops',
      label: 'Stop',
      type: 'group',
      group: 'Behaviour',
      maxEntries: 3,
      minEntries: 1,
      entryParameters: [{ name: 'color', label: 'Colour', type: 'color', defaultValue: '#ff0000' }],
      defaultEntries: [{ color: '#ff0000' }],
    },
  ],
  presets: [
    { id: 'default', name: 'Default', values: {} },
    { id: 'bold', name: 'Bold', values: { intensity: 1, tint: '#00ff00' } },
  ],
};

let registry: ShaderRegistry;

function seedWithShader(): void {
  const store = useEditorStore.getState();
  store.replaceDocument({
    version: 1,
    id: 'test',
    name: 'Test',
    objects: [],
    canvasWidth: 800,
    canvasHeight: 600,
  });
  store.addObject(createRectangle({ id: 'a', fill: shaderFill('invented', {}, 'default') }));
}

/** The shader values on the first object, for asserting on edits. */
function shaderValues(): Record<string, unknown> {
  const fill = useEditorStore.getState().document.objects[0]?.fill;
  if (!fill || !isShaderFill(fill)) throw new Error('expected a shader fill');
  return fill.values;
}

function renderInspector() {
  return render(<Inspector defaultShaderId="invented" registry={registry} />);
}

beforeEach(() => {
  resetObjectIds();
  registry = new ShaderRegistry();
  registry.registerOrThrow(inventedManifest);
  localStorage.clear();
  // The channel is a singleton for the application; tests must not inherit a
  // drag left in progress by an earlier one.
  transientChannel.cancel();
});

describe('controls are generated from the schema', () => {
  beforeEach(seedWithShader);

  it('renders a control for a shader the inspector has never seen', () => {
    renderInspector();

    expect(screen.getByRole('slider', { name: 'Intensity' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Tint hex value' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Invert' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Mode' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Origin X' })).toBeInTheDocument();
  });

  it('presents the declared groups in the declared order', () => {
    renderInspector();

    const headings = screen
      .getAllByRole('button')
      .map((button) => button.textContent ?? '')
      .filter((text) => text.startsWith('Look') || text.startsWith('Behaviour'));

    expect(headings[0]).toContain('Look');
    expect(headings[1]).toContain('Behaviour');
  });

  it('honours a numeric parameter constraints', () => {
    renderInspector();

    const slider = screen.getByRole('slider', { name: 'Intensity' });
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '1');
  });

  it('offers exactly the declared enum options', async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole('combobox', { name: 'Mode' }));

    expect(await screen.findByRole('option', { name: 'Soft' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hard' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('shows the current value for each parameter', () => {
    renderInspector();

    expect(screen.getByRole('slider', { name: 'Intensity' })).toHaveAttribute(
      'aria-valuenow',
      '0.5',
    );
    expect(screen.getByRole('textbox', { name: 'Tint hex value' })).toHaveValue('#4d7cff');
  });
});

describe('editing writes through to the document', () => {
  beforeEach(seedWithShader);

  it('records a colour change', async () => {
    const user = userEvent.setup();
    renderInspector();

    const hex = screen.getByRole('textbox', { name: 'Tint hex value' });
    await user.clear(hex);
    await user.type(hex, '#123456');
    await user.tab();

    expect(shaderValues().tint).toBe('#123456');
  });

  it('records a toggle change', async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole('switch', { name: 'Invert' }));

    expect(shaderValues().invert).toBe(true);
  });

  it('records a slider change from the keyboard', async () => {
    const user = userEvent.setup();
    renderInspector();

    const slider = screen.getByRole('slider', { name: 'Intensity' });
    slider.focus();
    await user.keyboard('{ArrowRight}');

    expect(shaderValues().intensity).toBe(0.51);
  });
});

describe('resetting to defaults', () => {
  beforeEach(seedWithShader);

  it('marks a parameter already at its default', () => {
    renderInspector();

    // Nothing has been edited, so every reset control reports the default.
    expect(screen.getAllByRole('button', { name: 'Default' }).length).toBeGreaterThan(0);
  });

  it('offers a reset once a parameter differs', async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole('switch', { name: 'Invert' }));

    expect(await screen.findAllByRole('button', { name: 'Reset' })).not.toHaveLength(0);
  });

  it('returns one parameter to its default', async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole('switch', { name: 'Invert' }));
    const [reset] = await screen.findAllByRole('button', { name: 'Reset' });
    if (reset) await user.click(reset);

    expect(shaderValues().invert).toBe(false);
  });

  it('returns every parameter to its default in one step', async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole('switch', { name: 'Invert' }));
    const before = useEditorStore.getState().history.past.length;

    await user.click(screen.getByRole('button', { name: 'Reset all' }));

    expect(useEditorStore.getState().history.past.length).toBe(before + 1);
  });
});

describe('presets', () => {
  beforeEach(seedWithShader);

  it('offers the shader declared presets', async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole('combobox', { name: 'Preset' }));

    expect(await screen.findByRole('option', { name: 'Bold' })).toBeInTheDocument();
  });

  it('applies a preset as a single edit', async () => {
    const user = userEvent.setup();
    renderInspector();
    const before = useEditorStore.getState().history.past.length;

    await user.click(screen.getByRole('combobox', { name: 'Preset' }));
    await user.click(await screen.findByRole('option', { name: 'Bold' }));

    expect(shaderValues().intensity).toBe(1);
    expect(useEditorStore.getState().history.past.length).toBe(before + 1);
  });
});

describe('repeatable groups', () => {
  beforeEach(seedWithShader);

  it('renders a control per entry', () => {
    renderInspector();

    expect(screen.getByText('Stop 1')).toBeInTheDocument();
  });

  it('adds an entry', async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole('button', { name: 'Add stop' }));

    expect(await screen.findByText('Stop 2')).toBeInTheDocument();
  });

  it('stops at the declared maximum and explains why', async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole('button', { name: 'Add stop' }));
    await user.click(screen.getByRole('button', { name: 'Add stop' }));

    expect(screen.getByRole('button', { name: 'Add stop' })).toBeDisabled();
    expect(screen.getByText(/At the limit of 3/)).toBeInTheDocument();
  });

  it('removes an entry', async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole('button', { name: 'Add stop' }));
    await user.click(await screen.findByRole('button', { name: 'Remove Stop 2' }));

    expect(screen.queryByText('Stop 2')).not.toBeInTheDocument();
  });

  it('keeps the last entry when a minimum is declared', () => {
    renderInspector();

    expect(screen.getByRole('button', { name: 'Remove Stop 1' })).toBeDisabled();
  });

  it('reorders entries', async () => {
    const user = userEvent.setup();
    renderInspector();

    await user.click(screen.getByRole('button', { name: 'Add stop' }));
    const moveUp = await screen.findByRole('button', { name: 'Move Stop 2 up' });

    expect(moveUp).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move Stop 1 up' })).toBeDisabled();
  });
});

describe('panel states', () => {
  it('invites a selection when nothing is selected', () => {
    useEditorStore.getState().clearSelection();
    renderInspector();

    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
  });

  it('reports how many are selected when several are', () => {
    const store = useEditorStore.getState();
    store.replaceDocument({
      version: 1,
      id: 't',
      name: 'T',
      objects: [],
      canvasWidth: 800,
      canvasHeight: 600,
    });
    store.addObject(createRectangle({ id: 'a' }));
    store.addObject(createRectangle({ id: 'b' }));
    store.selectMany(['a', 'b']);

    renderInspector();

    expect(screen.getByText('2 objects selected')).toBeInTheDocument();
  });

  it('offers colour and a shader for a solid fill', () => {
    const store = useEditorStore.getState();
    store.replaceDocument({
      version: 1,
      id: 't',
      name: 'T',
      objects: [],
      canvasWidth: 800,
      canvasHeight: 600,
    });
    store.addObject(createRectangle({ id: 'a', fill: solidFill('#ffffff') }));

    renderInspector();

    expect(screen.getByText('Solid fill')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Fill colour hex value' })).toHaveValue('#ffffff');
    expect(screen.getByRole('button', { name: 'Use a shader instead' })).toBeInTheDocument();
  });

  it('replaces a solid fill with a shader', async () => {
    const user = userEvent.setup();
    const store = useEditorStore.getState();
    store.replaceDocument({
      version: 1,
      id: 't',
      name: 'T',
      objects: [],
      canvasWidth: 800,
      canvasHeight: 600,
    });
    store.addObject(createRectangle({ id: 'a', fill: solidFill('#ffffff') }));

    renderInspector();
    await user.click(screen.getByRole('button', { name: 'Use a shader instead' }));

    expect(useEditorStore.getState().document.objects[0]?.fill.kind).toBe('shader');
  });

  it('names the shader when it is unavailable', () => {
    const store = useEditorStore.getState();
    store.replaceDocument({
      version: 1,
      id: 't',
      name: 'T',
      objects: [],
      canvasWidth: 800,
      canvasHeight: 600,
    });
    store.addObject(createRectangle({ id: 'a', fill: shaderFill('vanished') }));

    renderInspector();

    expect(screen.getByText('Shader unavailable')).toBeInTheDocument();
    expect(screen.getByText(/vanished/)).toBeInTheDocument();
  });
});

describe('the account area', () => {
  it('renders signed out, with no authentication dependency', () => {
    renderInspector();

    expect(screen.getByText('Signed out')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Donate' })).toBeInTheDocument();
  });
});

describe('a slider drag is one edit', () => {
  beforeEach(seedWithShader);

  it('writes nothing to the document while the drag is in progress', () => {
    renderInspector();
    const before = useEditorStore.getState().document.objects[0]?.fill;

    // Intermediate values go to the channel, not the store.
    transientChannel.begin();
    transientChannel.push({ objectId: 'a', key: 'intensity', value: 0.7 });
    transientChannel.push({ objectId: 'a', key: 'intensity', value: 0.9 });

    expect(useEditorStore.getState().document.objects[0]?.fill).toBe(before);
  });

  it('publishes every intermediate value for the renderer', () => {
    const seen: unknown[] = [];
    const unsubscribe = transientChannel.subscribe((edits) => {
      if (edits[0]) seen.push(edits[0].value);
    });

    transientChannel.begin();
    transientChannel.push({ objectId: 'a', key: 'intensity', value: 0.7 });
    transientChannel.push({ objectId: 'a', key: 'intensity', value: 0.9 });
    unsubscribe();

    expect(seen).toEqual([0.7, 0.9]);
  });

  it('records one history entry for the whole drag', async () => {
    const user = userEvent.setup();
    renderInspector();
    const before = useEditorStore.getState().history.past.length;

    const slider = screen.getByRole('slider', { name: 'Intensity' });
    slider.focus();
    // Each arrow press is a change followed by a commit, as a drag release is.
    await user.keyboard('{ArrowRight}');

    expect(useEditorStore.getState().history.past.length).toBe(before + 1);
  });
});
