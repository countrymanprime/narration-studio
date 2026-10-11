// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeakerColourField } from './SpeakerColourField';

afterEach(cleanup);

const entry = (category: string, speaker_color?: number) => ({ id: 'e1', category, speaker_color });

describe('SpeakerColourField', () => {
  it('shows only for a speaking category', () => {
    for (const category of ['Place', 'Item', 'Needs Review']) {
      const { container } = render(<SpeakerColourField entity={entry(category)} onChange={vi.fn()} />);
      expect(container.innerHTML).toBe('');
      cleanup();
    }
    render(<SpeakerColourField entity={entry('Character')} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Speaker colour' })).toBeTruthy();
  });

  it('offers Automatic and seven named hues', () => {
    render(<SpeakerColourField entity={entry('Character')} onChange={vi.fn()} />);
    const options = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(options).toHaveLength(8);
    expect(options[0]).toMatch(/^Automatic \(/);
  });

  it('reports a hue as 1..7 and Automatic as 0', () => {
    const onChange = vi.fn();
    render(<SpeakerColourField entity={entry('Character', 3)} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Speaker colour' }) as HTMLSelectElement;
    expect(select.value).toBe('3');
    fireEvent.change(select, { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.change(select, { target: { value: 'auto' } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('reads Automatic when no colour is chosen, and can be disabled', () => {
    render(<SpeakerColourField entity={entry('Character')} onChange={vi.fn()} disabled />);
    const select = screen.getByRole('combobox', { name: 'Speaker colour' }) as HTMLSelectElement;
    expect(select.value).toBe('auto');
    expect(select.disabled).toBe(true);
  });
});
