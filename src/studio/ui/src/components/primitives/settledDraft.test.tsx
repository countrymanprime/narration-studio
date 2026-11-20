// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSettledDraft } from './settledDraft';

afterEach(cleanup);

function Box({ value, onSettle }: { value: string; onSettle: (draft: string) => void }) {
  const box = useSettledDraft(value, onSettle);
  return <input aria-label="Name" value={box.draft} onChange={(event) => box.setDraft(event.target.value)} {...box.boxProps} />;
}

const input = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' });

describe('useSettledDraft', () => {
  it('keeps typing in the draft and reports nothing', async () => {
    const onSettle = vi.fn();
    render(<Box value="Alice" onSettle={onSettle} />);
    await userEvent.type(input(), ' Liddell');
    expect(input().value).toBe('Alice Liddell');
    expect(onSettle).not.toHaveBeenCalled();
  });

  it('hands the draft over on Enter', async () => {
    const onSettle = vi.fn();
    render(<Box value="Alice" onSettle={onSettle} />);
    await userEvent.type(input(), '!{Enter}');
    expect(onSettle).toHaveBeenCalledExactlyOnceWith('Alice!');
  });

  it('hands the draft over when focus leaves', async () => {
    const onSettle = vi.fn();
    render(<Box value="" onSettle={onSettle} />);
    await userEvent.type(input(), 'Ærøskøbing 東京');
    await userEvent.tab();
    expect(onSettle).toHaveBeenCalledExactlyOnceWith('Ærøskøbing 東京');
  });

  it('reports nothing for a draft equal to the value', async () => {
    const onSettle = vi.fn();
    render(<Box value="Alice" onSettle={onSettle} />);
    await userEvent.type(input(), 'x{Backspace}{Enter}');
    await userEvent.tab();
    expect(onSettle).not.toHaveBeenCalled();
  });

  it('puts the value back on Escape and reports nothing', async () => {
    const onSettle = vi.fn();
    render(<Box value="Alice" onSettle={onSettle} />);
    await userEvent.type(input(), ' Liddell{Escape}');
    expect(input().value).toBe('Alice');
    await userEvent.tab();
    expect(onSettle).not.toHaveBeenCalled();
  });

  it('does not bring an old draft back when the value returns to the one it was typed over', async () => {
    const { rerender } = render(<Box value="Alice" onSettle={() => undefined} />);
    await userEvent.type(input(), ' Liddell');
    rerender(<Box value="The Queen" onSettle={() => undefined} />);
    rerender(<Box value="Alice" onSettle={() => undefined} />);
    expect(input().value).toBe('Alice');
  });

  it('takes a new value from outside over the draft', async () => {
    const { rerender } = render(<Box value="Alice" onSettle={() => undefined} />);
    await userEvent.type(input(), ' Liddell');
    rerender(<Box value="The Queen" onSettle={() => undefined} />);
    expect(input().value).toBe('The Queen');
  });
});
