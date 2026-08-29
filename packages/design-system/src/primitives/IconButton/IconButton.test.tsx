import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';

const icon = <svg data-testid="icon" viewBox="0 0 16 16" />;

describe('IconButton — renders from its declared inputs alone', () => {
  it('takes its accessible name from the label, since an icon carries no text', () => {
    render(<IconButton icon={icon} label="Collapse library" />);

    expect(screen.getByRole('button', { name: 'Collapse library' })).toBeInTheDocument();
  });

  it('hides the icon from assistive technology so the name is not doubled', () => {
    render(<IconButton icon={icon} label="Settings" />);

    const iconWrapper = screen.getByTestId('icon').parentElement;
    expect(iconWrapper).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the supplied icon', () => {
    render(<IconButton icon={icon} label="Settings" />);

    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('defaults to a non-submitting button', () => {
    render(<IconButton icon={icon} label="Settings" />);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('applies the requested size', () => {
    render(<IconButton icon={icon} label="Settings" size="sm" />);

    expect(screen.getByRole('button').className).toContain('sm');
  });
});

describe('IconButton — selected state', () => {
  it('reports the selected state to assistive technology', () => {
    render(<IconButton icon={icon} label="Select tool" selected />);

    expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument();
  });

  it('reports the unselected state by default', () => {
    render(<IconButton icon={icon} label="Select tool" />);

    expect(screen.getByRole('button', { pressed: false })).toBeInTheDocument();
  });

  it('styles the selected state distinctly from hover', () => {
    render(<IconButton icon={icon} label="Select tool" selected />);

    expect(screen.getByRole('button').className).toContain('selected');
  });
});

describe('IconButton — reports interaction through its props', () => {
  it('calls onClick when activated', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton icon={icon} label="Settings" onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('exposes and enforces the disabled state', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<IconButton disabled icon={icon} label="Settings" onClick={onClick} />);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
