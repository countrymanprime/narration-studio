// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSettledDraft } from './settledDraft';

afterEach(cleanup);

function Box({ value, onSettle }: { value: string; onSettle: (draft: string) => void | Promise<unknown> }) {
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

  // B2 (#3680): the value does not change until the host answers, and each Enter or blur until then sent the same save again.
  it('a second Enter, or a blur after Enter, does not settle the same draft twice', async () => {
    const onSettle = vi.fn();
    render(<Box value="Alice" onSettle={onSettle} />);
    await userEvent.type(input(), '!{Enter}{Enter}');
    for (let repeat = 0; repeat < 20; repeat += 1) fireEvent.keyDown(input(), { key: 'Enter', repeat: true });
    await userEvent.tab();
    expect(onSettle).toHaveBeenCalledExactlyOnceWith('Alice!');
  });

  it('settles again once the narrator types, even back to the same text', async () => {
    const onSettle = vi.fn();
    render(<Box value="Alice" onSettle={onSettle} />);
    await userEvent.type(input(), '!{Enter}?{Backspace}{Enter}');
    expect(onSettle.mock.calls).toEqual([['Alice!'], ['Alice!']]);
  });

  it('settles a draft typed over the new value after the first was accepted', async () => {
    const onSettle = vi.fn();
    const { rerender } = render(<Box value="Alice" onSettle={onSettle} />);
    await userEvent.type(input(), '!{Enter}');
    rerender(<Box value="Alice!" onSettle={onSettle} />);
    await userEvent.type(input(), '{Backspace}{Enter}');
    expect(onSettle.mock.calls).toEqual([['Alice!'], ['Alice']]);
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

  // R3 (#3680): the answer to a save wiped what the narrator had typed since.
  describe('a save that settle returns', () => {
    function slowSave() {
      let answer: (kept: boolean) => void = () => undefined;
      const save = new Promise<boolean>((resolve) => {
        answer = resolve;
      });
      return { save, answer };
    }

    it('a draft typed after a settle stands when the settled value arrives', async () => {
      const { save, answer } = slowSave();
      const { rerender } = render(<Box value="BB0001" onSettle={() => save} />);
      await userEvent.clear(input());
      await userEvent.type(input(), 'BB0002{Enter}');
      await userEvent.clear(input());
      await userEvent.type(input(), 'CC00');
      rerender(<Box value="BB0002" onSettle={() => save} />);
      expect(input().value).toBe('CC00');
      await act(async () => answer(true));
      await userEvent.type(input(), '03');
      expect(input().value).toBe('CC0003');
    });

    it('that draft is then an edit of the new value: it settles, and Escape puts the new value back', async () => {
      const { save } = slowSave();
      const onSettle = vi.fn(() => save);
      const { rerender } = render(<Box value="BB0001" onSettle={onSettle} />);
      await userEvent.clear(input());
      await userEvent.type(input(), 'BB0002{Enter}');
      await userEvent.clear(input());
      await userEvent.type(input(), 'CC00');
      rerender(<Box value="BB0002" onSettle={onSettle} />);
      await userEvent.type(input(), '{Enter}');
      expect(onSettle.mock.calls).toEqual([['BB0002'], ['CC00']]);
      await userEvent.type(input(), '{Escape}');
      expect(input().value).toBe('BB0002');
    });

    it('it stands through one change only: the next value from outside replaces it', async () => {
      const { save } = slowSave();
      const { rerender } = render(<Box value="BB0001" onSettle={() => save} />);
      await userEvent.clear(input());
      await userEvent.type(input(), 'BB0002{Enter}');
      await userEvent.clear(input());
      await userEvent.type(input(), 'CC00');
      rerender(<Box value="BB0002" onSettle={() => save} />);
      rerender(<Box value="DD0004" onSettle={() => save} />);
      expect(input().value).toBe('DD0004');
    });

    it('a draft typed once the save has ended is replaced by a new value, as any draft is', async () => {
      const { save, answer } = slowSave();
      const { rerender } = render(<Box value="BB0001" onSettle={() => save} />);
      await userEvent.clear(input());
      await userEvent.type(input(), 'BB0002{Enter}');
      await act(async () => answer(false));
      await userEvent.clear(input());
      await userEvent.type(input(), 'CC00');
      rerender(<Box value="DD0004" onSettle={() => save} />);
      expect(input().value).toBe('DD0004');
    });

    it('a save that fails ends the same way', async () => {
      let fail: (why: Error) => void = () => undefined;
      const save = new Promise<never>((_, reject) => {
        fail = reject;
      });
      const { rerender } = render(<Box value="BB0001" onSettle={() => save} />);
      await userEvent.clear(input());
      await userEvent.type(input(), 'BB0002{Enter}');
      await act(async () => fail(new Error('read-only')));
      await userEvent.clear(input());
      await userEvent.type(input(), 'CC00');
      rerender(<Box value="DD0004" onSettle={() => save} />);
      expect(input().value).toBe('DD0004');
    });

    it('without read, a refused save leaves the draft in the box', async () => {
      const { save, answer } = slowSave();
      render(<Box value="BB0001" onSettle={() => save} />);
      await userEvent.clear(input());
      await userEvent.type(input(), 'BB0002{Enter}');
      await act(async () => answer(false));
      expect(input().value).toBe('BB0002');
    });
  });

  // NumberInput commit="settle" is the caller of these options; its own tests hold the number behaviour.
  describe('read and settleOnUnmount', () => {
    const upper = (draft: string) => (draft.trim() === '' ? null : draft.trim().toUpperCase());

    function ReadBox({ value, onSettle, settleOnUnmount }: { value: string; onSettle: (text: string) => void | Promise<unknown>; settleOnUnmount?: boolean }) {
      const box = useSettledDraft(value, onSettle, { read: upper, settleOnUnmount });
      return <input aria-label="Name" value={box.draft} onChange={(event) => box.setDraft(event.target.value)} {...box.boxProps} />;
    }

    it('settles what the draft reads as, and puts the value back for a draft that reads as nothing or as the value', async () => {
      const onSettle = vi.fn();
      render(<ReadBox value="AB" onSettle={onSettle} />);
      await userEvent.type(input(), 'c{Enter}');
      expect(onSettle).toHaveBeenCalledExactlyOnceWith('ABC');
      expect(input().value).toBe('AB');
      await userEvent.clear(input());
      await userEvent.type(input(), ' {Enter}');
      expect(input().value).toBe('AB');
      await userEvent.clear(input());
      await userEvent.type(input(), 'ab {Enter}');
      expect(input().value).toBe('AB');
      expect(onSettle).toHaveBeenCalledTimes(1);
    });

    it('shows the text being saved until the save ends, then the value; the stored value typed meanwhile is sent after it', async () => {
      const ends: ((kept: boolean) => void)[] = [];
      const onSettle = vi.fn(() => new Promise<boolean>((resolve) => ends.push(resolve)));
      render(<ReadBox value="AB" onSettle={onSettle} />);
      await userEvent.clear(input());
      await userEvent.type(input(), 'cd{Enter}{Enter}');
      expect(input().value).toBe('CD');
      await userEvent.clear(input());
      await userEvent.type(input(), 'ab{Enter}');
      expect(onSettle.mock.calls).toEqual([['CD'], ['AB']]);
      await act(async () => ends[0](true));
      expect(input().value).toBe('AB');
      await act(async () => ends[1](false));
      expect(input().value).toBe('AB');
    });

    it('settleOnUnmount settles a standing draft once, and nothing after Escape or Enter', async () => {
      const onSettle = vi.fn();
      const held = render(<ReadBox value="AB" onSettle={onSettle} settleOnUnmount />);
      await userEvent.type(input(), 'c');
      held.unmount();
      expect(onSettle).toHaveBeenCalledExactlyOnceWith('ABC');
      const escaped = render(<ReadBox value="AB" onSettle={onSettle} settleOnUnmount />);
      await userEvent.type(input(), 'c{Escape}');
      escaped.unmount();
      const entered = render(<ReadBox value="AB" onSettle={onSettle} settleOnUnmount />);
      await userEvent.type(input(), 'd{Enter}');
      entered.unmount();
      expect(onSettle.mock.calls).toEqual([['ABC'], ['ABD']]);
    });

    it('without settleOnUnmount a draft is dropped with the box', async () => {
      const onSettle = vi.fn();
      const { unmount } = render(<ReadBox value="AB" onSettle={onSettle} />);
      await userEvent.type(input(), 'c');
      unmount();
      expect(onSettle).not.toHaveBeenCalled();
    });
  });
});
