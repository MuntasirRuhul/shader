import { runAccessibilitySuite } from '../testing/accessibilitySuite';
import { Button } from './Button/Button';
import { Collapsible } from './Collapsible/Collapsible';
import { ColorField } from './ColorField/ColorField';
import { IconButton } from './IconButton/IconButton';
import { NumberField } from './NumberField/NumberField';
import { Popover } from './Popover/Popover';
import { Select } from './Select/Select';
import { Slider } from './Slider/Slider';
import { TextField } from './TextField/TextField';
import { Toggle } from './Toggle/Toggle';
import { Tooltip, TooltipProvider } from './Tooltip/Tooltip';

const icon = <svg viewBox="0 0 16 16" />;

/**
 * Every interactive primitive runs the same contract. As later primitives land
 * they are added here rather than growing a separate accessibility test.
 */

runAccessibilitySuite({
  name: 'Button',
  role: 'button',
  accessibleName: 'Export',
  render: () => <Button>Export</Button>,
});

runAccessibilitySuite({
  name: 'Button (primary)',
  role: 'button',
  accessibleName: 'Save',
  render: () => <Button variant="primary">Save</Button>,
});

runAccessibilitySuite({
  name: 'IconButton',
  role: 'button',
  accessibleName: 'Settings',
  render: () => <IconButton icon={icon} label="Settings" />,
  state: { attribute: 'aria-pressed', value: 'false' },
});

runAccessibilitySuite({
  name: 'IconButton (selected)',
  role: 'button',
  accessibleName: 'Select tool',
  render: () => <IconButton icon={icon} label="Select tool" selected />,
  state: { attribute: 'aria-pressed', value: 'true' },
});

runAccessibilitySuite({
  name: 'Tooltip',
  role: 'button',
  accessibleName: 'Export',
  render: () => (
    <TooltipProvider delayDuration={0}>
      <Tooltip content="Exports the document" delayDuration={0}>
        <Button>Export</Button>
      </Tooltip>
    </TooltipProvider>
  ),
  layer: {
    // Focusing the trigger is what opens a tooltip; tabbing already did that.
    open: () => Promise.resolve(),
    contentText: 'Exports the document',
  },
});

runAccessibilitySuite({
  name: 'Slider',
  role: 'slider',
  accessibleName: 'Speed',
  render: () => (
    <Slider label="Speed" max={2} min={0} onChange={() => undefined} step={0.01} value={0.5} />
  ),
  state: { attribute: 'aria-valuenow', value: '0.5' },
});

runAccessibilitySuite({
  name: 'NumberField',
  role: 'textbox',
  accessibleName: 'Angle',
  render: () => <NumberField label="Angle" onValueChange={() => undefined} value={45} />,
  // Enter commits the value and leaves the field, by design.
  activationKeepsFocus: false,
});

runAccessibilitySuite({
  name: 'TextField',
  role: 'textbox',
  accessibleName: 'Name',
  render: () => <TextField label="Name" onValueChange={() => undefined} value="Hello" />,
});

runAccessibilitySuite({
  name: 'Toggle',
  role: 'switch',
  accessibleName: 'Animate',
  render: () => <Toggle checked label="Animate" onCheckedChange={() => undefined} />,
  state: { attribute: 'aria-checked', value: 'true' },
});

runAccessibilitySuite({
  name: 'Select',
  role: 'combobox',
  accessibleName: 'Blend mode',
  render: () => (
    <Select
      label="Blend mode"
      onValueChange={() => undefined}
      options={[
        { value: 'normal', label: 'Normal' },
        { value: 'screen', label: 'Screen' },
      ]}
      value="normal"
    />
  ),
});

runAccessibilitySuite({
  name: 'ColorField',
  role: 'textbox',
  accessibleName: 'Tint hex value',
  render: () => <ColorField label="Tint" onValueChange={() => undefined} value="#4d7cff" />,
  // The swatch's native picker is the first stop; the hex entry follows it.
  tabsToReach: 2,
  activationKeepsFocus: false,
});

runAccessibilitySuite({
  name: 'Collapsible',
  role: 'button',
  accessibleName: 'Colour',
  render: () => (
    <Collapsible onOpenChange={() => undefined} open title="Colour">
      <p>section body</p>
    </Collapsible>
  ),
});

runAccessibilitySuite({
  name: 'Popover',
  role: 'button',
  accessibleName: 'Open',
  render: () => (
    <Popover trigger={<Button>Open</Button>}>
      <p>popover body</p>
    </Popover>
  ),
  layer: {
    open: (user) => user.keyboard('{Enter}'),
    contentText: 'popover body',
    // A popover is not modal: focus may leave it, unlike a dialog.
  },
});
