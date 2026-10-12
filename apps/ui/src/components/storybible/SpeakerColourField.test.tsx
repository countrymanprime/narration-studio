// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpeakerColourField } from './SpeakerColourField';

afterEach(cleanup);

const entry = (speaker_color?: number) => ({ id: 'e1', speaker_color });

describe('SpeakerColourField', () => {
  it('a speaker colour is offered for any type that can speak, and not for one that cannot', () => {
    const { container } = render(<SpeakerColourField entity={entry()} speaks={false} onChange={vi.fn()} />);
    expect(container.innerHTML).toBe('');
    cleanup();
    render(<SpeakerColourField entity={entry()} speaks onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Speaker colour' })).toBeTruthy();
  });

  it('offers Automatic and seven named hues', () => {
    render(<SpeakerColourField entity={entry()} speaks onChange={vi.fn()} />);
    const options = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(options).toHaveLength(8);
    expect(options[0]).toMatch(/^Automatic \(/);
  });

  it('reports a hue as 1..7 and Automatic as 0', () => {
    const onChange = vi.fn();
    render(<SpeakerColourField entity={entry(3)} speaks onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Speaker colour' }) as HTMLSelectElement;
    expect(select.value).toBe('3');
    fireEvent.change(select, { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.change(select, { target: { value: 'auto' } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('reads Automatic when no colour is chosen, and can be disabled', () => {
    render(<SpeakerColourField entity={entry()} speaks onChange={vi.fn()} disabled />);
    const select = screen.getByRole('combobox', { name: 'Speaker colour' }) as HTMLSelectElement;
    expect(select.value).toBe('auto');
    expect(select.disabled).toBe(true);
  });
});
