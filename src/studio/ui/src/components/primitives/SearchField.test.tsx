// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchField } from './SearchField';

afterEach(cleanup);

function Controlled({ start = '', onChange = () => undefined }: { start?: string; onChange?: (value: string) => void }) {
  const [value, setValue] = useState(start);
  return (
    <SearchField
      label="Search manuscript"
      value={value}
      placeholder="Search manuscript…"
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
}

describe('SearchField', () => {
  it('is a text box named by its label with no clear button while it is empty', () => {
    render(<Controlled />);
    expect(screen.getByRole('textbox', { name: 'Search manuscript' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('shows a clear button once there is text, and clearing reports an empty value and refocuses the field', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onChange={onChange} />);
    const field = screen.getByRole('textbox', { name: 'Search manuscript' });
    await user.type(field, 'Rabbit');
    expect(onChange).toHaveBeenLastCalledWith('Rabbit');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenLastCalledWith('');
    expect((field as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(field);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('names the clear button by clearLabel', () => {
    render(<SearchField label="Filter" value="x" clearLabel="Clear the filter" onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Clear the filter' })).toBeTruthy();
  });

  it('starts with the clear button when it is given text', () => {
    render(<Controlled start="hare" />);
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy();
  });

  it('is the text box of a combobox when it is given the list it drives', () => {
    render(
      <SearchField
        label="Search speakers"
        value=""
        onChange={vi.fn()}
        combobox={{ role: 'combobox', 'aria-controls': 'list', 'aria-activedescendant': 'list-option-a', 'aria-expanded': true }}
      />,
    );
    const box = screen.getByRole('combobox', { name: 'Search speakers' });
    expect(box.getAttribute('aria-controls')).toBe('list');
    expect(box.getAttribute('aria-activedescendant')).toBe('list-option-a');
    expect(box.getAttribute('aria-expanded')).toBe('true');
  });
});
