// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckedStamp, useCheckedAt } from './CheckedStamp';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Probe() {
  const [at, markChecked] = useCheckedAt();
  return (
    <>
      <button onClick={markChecked}>Check again</button>
      <CheckedStamp at={at} />
    </>
  );
}

describe('CheckedStamp', () => {
  it('draws nothing before the first read', () => {
    render(<CheckedStamp at={null} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says when the last read finished, and a second read of the same answer reads differently', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 15, 42, 7));
    render(<Probe />);
    act(() => screen.getByRole('button', { name: 'Check again' }).click());
    const first = screen.getByRole('status').textContent;
    expect(first).toMatch(/^Checked .*42.*07/);
    vi.setSystemTime(new Date(2026, 10, 10, 15, 42, 9));
    act(() => screen.getByRole('button', { name: 'Check again' }).click());
    expect(screen.getByRole('status').textContent).not.toBe(first);
  });
});
