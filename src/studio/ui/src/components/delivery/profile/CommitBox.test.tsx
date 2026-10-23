// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommitBox } from './CommitBox';

afterEach(cleanup);

// The parent a real card is: it keeps the committed value and hands it back.
function Host({ initial, onCommit }: { initial: string; onCommit: (text: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <CommitBox
        label="Name"
        value={value}
        onCommit={(text) => {
          setValue(text);
          onCommit(text);
        }}
      />
      <button type="button">elsewhere</button>
    </>
  );
}

describe('CommitBox', () => {
  it('commits on Enter and on blur only when the value changed', async () => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(<Host initial="Alice" onCommit={commit} />);
    const box = screen.getByLabelText('Name');

    // No change: focusing, pressing Enter and leaving commit nothing.
    await user.click(box);
    await user.keyboard('{Enter}');
    await user.tab();
    expect(commit).not.toHaveBeenCalled();

    // A change followed by Enter commits once.
    await user.clear(box);
    await user.type(box, 'Bob{Enter}');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith('Bob');

    // Leaving after that commit does not repeat it.
    await user.tab();
    expect(commit).toHaveBeenCalledTimes(1);

    // A change followed by a blur commits once.
    await user.click(box);
    await user.type(box, 'by');
    await user.tab();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenLastCalledWith('Bobby');

    // Typing the committed value back in is no change.
    await user.click(box);
    await user.type(box, 'x{Backspace}');
    await user.keyboard('{Enter}');
    await user.tab();
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it('does not commit on Escape and reverts the box to the last value', async () => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(<Host initial="Alice" onCommit={commit} />);
    const box = screen.getByLabelText('Name');
    await user.click(box);
    await user.type(box, 'zzz{Escape}');
    expect((box as HTMLInputElement).value).toBe('Alice');
    await user.tab();
    expect(commit).not.toHaveBeenCalled();
  });
});
