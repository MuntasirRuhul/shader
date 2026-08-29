import { runAccessibilitySuite } from '../testing/accessibilitySuite';
import { Button } from './Button/Button';
import { IconButton } from './IconButton/IconButton';
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
