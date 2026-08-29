import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button/Button';
import { Collapsible } from './Collapsible/Collapsible';
import { ColorField } from './ColorField/ColorField';
import { NumberField } from './NumberField/NumberField';
import { Popover } from './Popover/Popover';
import { ScrollArea } from './ScrollArea/ScrollArea';
import { Select } from './Select/Select';
import { Slider } from './Slider/Slider';
import { TextField } from './TextField/TextField';
import { Toggle } from './Toggle/Toggle';

/**
 * Each primitive is rendered from its declared inputs alone — no store, no
 * provider, no application — which is the contract the design system spec
 * requires of them.
 */

describe('Slider', () => {
  const props = { label: 'Speed', value: 0.5, min: 0, max: 2, step: 0.01 };

  it('renders from its inputs alone', () => {
    render(<Slider {...props} onChange={vi.fn()} />);

    expect(screen.getByRole('slider', { name: 'Speed' })).toBeInTheDocument();
  });

  it('exposes its value and range to assistive technology', () => {
    render(<Slider {...props} onChange={vi.fn()} />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '0.5');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '2');
  });

  it('reports a change from the keyboard', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Slider {...props} onChange={onChange} />);

    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith(0.51);
  });

  it('honours the declared step', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Slider {...props} onChange={onChange} step={0.25} />);

    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith(0.75);
  });

  it('does not respond when disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Slider {...props} disabled onChange={onChange} />);

    await user.tab();
    await user.keyboard('{ArrowRight}');

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('NumberField', () => {
  const props = { label: 'Angle', value: 45, min: 0, max: 360 };

  it('renders its value', () => {
    render(<NumberField {...props} onValueChange={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Angle' })).toHaveValue('45');
  });

  it('commits a typed value on blur', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberField {...props} onValueChange={onValueChange} />);

    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, '90');
    await user.tab();

    expect(onValueChange).toHaveBeenCalledWith(90);
  });

  it('clamps a value above the maximum', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberField {...props} onValueChange={onValueChange} />);

    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, '9999');
    await user.tab();

    expect(onValueChange).toHaveBeenCalledWith(360);
  });

  it('clamps a value below the minimum', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberField {...props} onValueChange={onValueChange} />);

    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, '-50');
    await user.tab();

    expect(onValueChange).toHaveBeenCalledWith(0);
  });

  it('reverts unparseable input without reporting a change', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberField {...props} onValueChange={onValueChange} />);

    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, 'not a number');
    await user.tab();

    expect(onValueChange).not.toHaveBeenCalled();
    expect(field).toHaveValue('45');
  });

  it('lets a partial value be typed without committing it', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberField {...props} onValueChange={onValueChange} />);

    const field = screen.getByRole('textbox');
    await user.clear(field);
    // "-" and "1." are states you pass through on the way to a number.
    await user.type(field, '-');

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('rounds when the parameter is a whole number', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberField {...props} integer onValueChange={onValueChange} />);

    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, '12.7');
    await user.tab();

    expect(onValueChange).toHaveBeenCalledWith(13);
  });

  it('abandons the edit on Escape', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<NumberField {...props} onValueChange={onValueChange} />);

    const field = screen.getByRole('textbox');
    await user.clear(field);
    await user.type(field, '200{Escape}');

    expect(onValueChange).not.toHaveBeenCalled();
    expect(field).toHaveValue('45');
  });
});

describe('TextField', () => {
  it('renders its value', () => {
    render(<TextField label="Name" onValueChange={vi.fn()} value="Hello" />);

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Hello');
  });

  it('reports each change', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<TextField label="Name" onValueChange={onValueChange} value="" />);

    await user.type(screen.getByRole('textbox'), 'a');

    expect(onValueChange).toHaveBeenCalledWith('a');
  });
});

describe('Toggle', () => {
  it('renders as a switch reporting its state', () => {
    render(<Toggle checked label="Animate" onCheckedChange={vi.fn()} />);

    expect(screen.getByRole('switch', { name: 'Animate', checked: true })).toBeInTheDocument();
  });

  it('reports the unchecked state', () => {
    render(<Toggle checked={false} label="Animate" onCheckedChange={vi.fn()} />);

    expect(screen.getByRole('switch', { checked: false })).toBeInTheDocument();
  });

  it('toggles from the keyboard', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Toggle checked={false} label="Animate" onCheckedChange={onCheckedChange} />);

    await user.tab();
    await user.keyboard(' ');

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});

describe('Select', () => {
  const options = [
    { value: 'normal', label: 'Normal' },
    { value: 'screen', label: 'Screen' },
  ];

  it('renders the chosen option label', () => {
    render(<Select label="Blend mode" onValueChange={vi.fn()} options={options} value="screen" />);

    expect(screen.getByRole('combobox', { name: 'Blend mode' })).toHaveTextContent('Screen');
  });

  it('falls back to the raw value for an unrecognised option', () => {
    render(<Select label="Blend mode" onValueChange={vi.fn()} options={options} value="odd" />);

    expect(screen.getByRole('combobox')).toHaveTextContent('odd');
  });

  it('is reachable by keyboard', async () => {
    const user = userEvent.setup();
    render(<Select label="Blend mode" onValueChange={vi.fn()} options={options} value="normal" />);

    await user.tab();

    expect(screen.getByRole('combobox')).toHaveFocus();
  });
});

describe('ColorField', () => {
  it('renders the colour and a hex entry', () => {
    render(<ColorField label="Tint" onValueChange={vi.fn()} value="#4d7cff" />);

    expect(screen.getByLabelText('Tint')).toHaveValue('#4d7cff');
    expect(screen.getByRole('textbox', { name: 'Tint hex value' })).toHaveValue('#4d7cff');
  });

  it('commits a valid hex value', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorField label="Tint" onValueChange={onValueChange} value="#4d7cff" />);

    const hex = screen.getByRole('textbox', { name: 'Tint hex value' });
    await user.clear(hex);
    await user.type(hex, '#ff0000');
    await user.tab();

    expect(onValueChange).toHaveBeenCalledWith('#ff0000');
  });

  it('reverts a partial hex value rather than committing it', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorField label="Tint" onValueChange={onValueChange} value="#4d7cff" />);

    const hex = screen.getByRole('textbox', { name: 'Tint hex value' });
    await user.clear(hex);
    await user.type(hex, '#4d7');
    await user.tab();

    expect(onValueChange).not.toHaveBeenCalled();
    expect(hex).toHaveValue('#4d7cff');
  });

  it('accepts an uppercase hex value', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorField label="Tint" onValueChange={onValueChange} value="#4d7cff" />);

    const hex = screen.getByRole('textbox', { name: 'Tint hex value' });
    await user.clear(hex);
    await user.type(hex, '#AABBCC');
    await user.tab();

    expect(onValueChange).toHaveBeenCalledWith('#aabbcc');
  });
});

describe('Collapsible', () => {
  it('shows its content when open', () => {
    render(
      <Collapsible onOpenChange={vi.fn()} open title="Colour">
        <p>inside</p>
      </Collapsible>,
    );

    expect(screen.getByText('inside')).toBeInTheDocument();
  });

  it('hides its content when closed', () => {
    render(
      <Collapsible onOpenChange={vi.fn()} open={false} title="Colour">
        <p>inside</p>
      </Collapsible>,
    );

    expect(screen.queryByText('inside')).not.toBeInTheDocument();
  });

  it('reports a toggle from the keyboard', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Collapsible onOpenChange={onOpenChange} open title="Colour">
        <p>inside</p>
      </Collapsible>,
    );

    await user.tab();
    await user.keyboard('{Enter}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('ScrollArea', () => {
  it('renders its children', () => {
    render(
      <ScrollArea>
        <p>scrolling content</p>
      </ScrollArea>,
    );

    expect(screen.getByText('scrolling content')).toBeInTheDocument();
  });
});

describe('Popover', () => {
  it('renders its trigger without showing the content', () => {
    render(
      <Popover trigger={<Button>Open</Button>}>
        <p>popover body</p>
      </Popover>,
    );

    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.queryByText('popover body')).not.toBeInTheDocument();
  });

  it('shows its content when opened', () => {
    render(
      <Popover open trigger={<Button>Open</Button>}>
        <p>popover body</p>
      </Popover>,
    );

    expect(screen.getByText('popover body')).toBeInTheDocument();
  });

  it('opens from the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<Button>Open</Button>}>
        <p>popover body</p>
      </Popover>,
    );

    await user.tab();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('popover body')).toBeInTheDocument();
  });
});
