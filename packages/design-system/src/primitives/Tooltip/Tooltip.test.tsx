import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from '../Button/Button';
import { IconButton } from '../IconButton/IconButton';
import { Tooltip, TooltipProvider } from './Tooltip';

const icon = <svg viewBox="0 0 16 16" />;

function renderTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

describe('Tooltip — renders from its declared inputs alone', () => {
  it('renders its trigger without showing the tooltip up front', () => {
    renderTooltip(
      <Tooltip content="Exports the document">
        <Button>Export</Button>
      </Tooltip>,
    );

    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.queryByText('Exports the document')).not.toBeInTheDocument();
  });

  it('shows the content when the trigger is opened', () => {
    renderTooltip(
      <Tooltip content="Exports the document" open>
        <Button>Export</Button>
      </Tooltip>,
    );

    expect(screen.getAllByText('Exports the document').length).toBeGreaterThan(0);
  });

  it('renders an optional keyboard shortcut beside the content', () => {
    renderTooltip(
      <Tooltip content="Select tool" open shortcut="V">
        <IconButton icon={icon} label="Select tool" />
      </Tooltip>,
    );

    expect(screen.getAllByText('V').length).toBeGreaterThan(0);
  });

  it('leaves the trigger as the element it was given', () => {
    renderTooltip(
      <Tooltip content="Settings">
        <IconButton icon={icon} label="Settings" />
      </Tooltip>,
    );

    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('type', 'button');
  });
});

describe('Tooltip — supplements rather than replaces the accessible name', () => {
  it('leaves an icon-only trigger named by its own label', () => {
    renderTooltip(
      <Tooltip content="Opens application settings" open>
        <IconButton icon={icon} label="Settings" />
      </Tooltip>,
    );

    // The tooltip describes the control; the label still names it.
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('describes the trigger when open', () => {
    renderTooltip(
      <Tooltip content="Opens application settings" open>
        <IconButton icon={icon} label="Settings" />
      </Tooltip>,
    );

    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-describedby');
  });
});

describe('Tooltip — opens and dismisses', () => {
  it('opens on pointer hover', async () => {
    const user = userEvent.setup();
    renderTooltip(
      <Tooltip content="Exports the document" delayDuration={0}>
        <Button>Export</Button>
      </Tooltip>,
    );

    await user.hover(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findAllByText('Exports the document')).not.toHaveLength(0);
  });

  it('opens on keyboard focus so it is reachable without a pointer', async () => {
    const user = userEvent.setup();
    renderTooltip(
      <Tooltip content="Exports the document" delayDuration={0}>
        <Button>Export</Button>
      </Tooltip>,
    );

    await user.tab();

    expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus();
    expect(await screen.findAllByText('Exports the document')).not.toHaveLength(0);
  });

  it('dismisses on Escape without moving focus off the trigger', async () => {
    const user = userEvent.setup();
    renderTooltip(
      <Tooltip content="Exports the document" delayDuration={0}>
        <Button>Export</Button>
      </Tooltip>,
    );

    await user.tab();
    await screen.findAllByText('Exports the document');

    await user.keyboard('{Escape}');

    expect(screen.queryByText('Exports the document')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus();
  });
});
