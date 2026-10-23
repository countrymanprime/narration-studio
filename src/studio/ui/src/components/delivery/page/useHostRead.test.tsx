// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { heardText, useHostRead } from './useHostRead';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
};

function Probe({ read, running = () => false }: { read: () => Promise<string>; running?: (value: string) => boolean }) {
  const host = useHostRead(read, running);
  return (
    <div>
      <p data-testid="value">{host.value ?? 'none'}</p>
      <p data-testid="error">{host.error ?? 'none'}</p>
      <button onClick={host.again}>again</button>
      <button onClick={() => host.set('set')}>set</button>
    </div>
  );
}

describe('useHostRead', () => {
  it('out of order: an older answer that arrives after a newer one is dropped', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const answers = [first, second];
    let call = 0;
    render(<Probe read={() => answers[call++]!.promise} />);
    act(() => screen.getByText('again').click());
    await act(async () => second.resolve('newer'));
    await act(async () => first.resolve('older'));
    expect(screen.getByTestId('value').textContent).toBe('newer');
  });

  it('an answer after leaving the page writes nothing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const late = deferred<string>();
    const { unmount } = render(<Probe read={() => late.promise} />);
    unmount();
    await act(async () => late.resolve('late'));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('a set after a read was sent wins over that read, and the same failure twice still retries', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const slow = deferred<string>();
    let call = 0;
    const read = vi.fn(() => (++call === 1 ? slow.promise : Promise.reject(new Error('same words'))));
    render(<Probe read={read} />);
    act(() => screen.getByText('set').click());
    await act(async () => slow.resolve('stale read'));
    expect(screen.getByTestId('value').textContent).toBe('set');
    act(() => screen.getByText('again').click());
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByTestId('error').textContent).toBe('same words');
    const before = read.mock.calls.length;
    for (let tick = 0; tick < 3; tick += 1) await act(async () => vi.advanceTimersByTimeAsync(2100));
    expect(read.mock.calls.length - before).toBe(3);
    expect(screen.getByTestId('value').textContent).toBe('set');
  });

  it('says when the host was last heard', () => {
    expect(heardText(undefined)).toBe('not heard yet');
    expect(heardText(1_000, 13_400)).toBe('last heard 12 s ago');
    expect(heardText(5_000, 1_000)).toBe('last heard 0 s ago');
  });
});
