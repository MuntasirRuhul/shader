import type { ImageParameter } from '@shader/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ImageFileModule from '../persistence/imageFile';
import { ImageField } from './ImageField';

/**
 * The control for a picture a shader samples. Reading the file is the
 * importer's job and is tested there; what matters here is that what it
 * returns reaches the parameter, and that a refusal is shown rather than
 * swallowed.
 */

const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';

const importImageFile = vi.hoisted(() => vi.fn());

vi.mock('../persistence/imageFile', async (importOriginal) => ({
  ...(await importOriginal<typeof ImageFileModule>()),
  importImageFile,
}));

const parameter: ImageParameter = {
  name: 'source',
  label: 'Picture',
  type: 'image',
  defaultValue: '',
};

function choose() {
  return screen.getByLabelText('Choose a picture for Picture');
}

beforeEach(() => {
  importImageFile.mockReset();
  importImageFile.mockResolvedValue({
    ok: true,
    image: { source: PIXEL, mediaType: 'image/png', naturalWidth: 1, naturalHeight: 1 },
  });
});

describe('choosing a picture', () => {
  it('offers a picker when nothing has been chosen', () => {
    render(<ImageField onChange={() => undefined} parameter={parameter} value="" />);

    expect(screen.getByRole('button', { name: 'Choose a picture' })).toBeInTheDocument();
    expect(screen.getByText('No picture chosen')).toBeInTheDocument();
  });

  it('reports the chosen file as a data URI', async () => {
    const onChange = vi.fn();
    render(<ImageField onChange={onChange} parameter={parameter} value="" />);

    await userEvent.upload(choose(), new File(['x'], 'sea.png', { type: 'image/png' }));

    expect(onChange).toHaveBeenCalledWith(PIXEL);
  });

  it('shows what was chosen, rather than its filename', () => {
    render(<ImageField onChange={() => undefined} parameter={parameter} value={PIXEL} />);

    const preview = screen.getByRole('img', { name: 'Picture, as chosen' });
    expect(preview).toHaveAttribute('src', PIXEL);
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
  });

  it('clears the picture when it is removed', async () => {
    const onChange = vi.fn();
    render(<ImageField onChange={onChange} parameter={parameter} value={PIXEL} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('says why a file was refused, and changes nothing', async () => {
    importImageFile.mockResolvedValue({
      ok: false,
      message: 'sea.png is 21.4 MB, over the limit.',
    });
    const onChange = vi.fn();
    render(<ImageField onChange={onChange} parameter={parameter} value="" />);

    await userEvent.upload(choose(), new File(['x'], 'sea.png', { type: 'image/png' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('over the limit');
    expect(onChange).not.toHaveBeenCalled();
  });
});
