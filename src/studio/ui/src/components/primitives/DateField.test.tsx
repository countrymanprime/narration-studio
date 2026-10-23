// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateField } from './DateField';

afterEach(cleanup);

describe('DateField', () => {
  it('is a native date input named by its label, showing the ISO value', () => {
    render(<DateField label="Due" value="2026-10-14" onChange={() => undefined} />);
    const field = screen.getByLabelText('Due') as HTMLInputElement;
    expect(field.type).toBe('date');
    expect(field.value).toBe('2026-10-14');
  });

  it('reports the date written YYYY-MM-DD, and an empty string when cleared', () => {
    const onChange = vi.fn();
    render(<DateField label="Due" value="2026-10-14" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Due'), { target: { value: '2026-11-02' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-11-02');
    fireEvent.change(screen.getByLabelText('Due'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('is named by a visible label through its id instead', () => {
    render(
      <>
        <label htmlFor="due-id">Delivery due</label>
        <DateField id="due-id" value="2026-10-14" onChange={() => undefined} />
      </>,
    );
    expect(screen.getByLabelText('Delivery due')).toBeTruthy();
  });

  it('takes the width a caller gives it, else fills its container, and passes the ref and attributes through', () => {
    const { rerender } = render(<DateField label="Due" value="" onChange={() => undefined} />);
    expect(screen.getByLabelText('Due').className).toContain('w-full');
    rerender(<DateField label="Due" value="" onChange={() => undefined} className="w-40" disabled />);
    const field = screen.getByLabelText('Due') as HTMLInputElement;
    expect(field.className).not.toContain('w-full');
    expect(field.disabled).toBe(true);
  });
});
