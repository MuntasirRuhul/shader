import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button — renders from its declared inputs alone', () => {
  it('renders its label with no surrounding application', () => {
    render(<Button>Export</Button>);

    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('defaults to a non-submitting button so it is safe inside a form', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('honours an explicit type', () => {
    render(<Button type="submit">Save</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('applies the requested variant and size', () => {
    render(
      <Button size="sm" variant="primary">
        Go
      </Button>,
    );

    const button = screen.getByRole('button');
    expect(button.className).toContain('primary');
    expect(button.className).toContain('sm');
  });

  it('falls back to the quiet variant so the accent stays scarce', () => {
    render(<Button>Quiet</Button>);

    expect(screen.getByRole('button').className).toContain('secondary');
  });

  it('renders start and end slots around the label', () => {
    render(
      <Button endSlot={<span>after</span>} startSlot={<span>before</span>}>
        Label
      </Button>,
    );

    expect(screen.getByRole('button')).toHaveTextContent('beforeLabelafter');
  });

  it('renders the supplied element when asChild is set', () => {
    render(
      <Button asChild>
        <a href="https://example.com">Docs</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link.className).toContain('button');
  });

  it('keeps caller class names alongside its own', () => {
    render(<Button className="custom">Label</Button>);

    const button = screen.getByRole('button');
    expect(button.className).toContain('custom');
    expect(button.className).toContain('button');
  });
});

describe('Button — reports interaction through its props', () => {
  it('calls onClick when activated', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Press</Button>);

    await user.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('exposes and enforces the disabled state', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Press
      </Button>,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
