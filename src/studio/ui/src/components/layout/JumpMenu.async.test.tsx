// @vitest-environment jsdom
// The jump menu with a search source that answers later (#2775): the waiting row, the debounce, dropped stale answers, the bounded
// wait, a failure said in a toast, the screen reader's count, and an active row that stays put when an answer arrives.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_CATALOG } from '../../input/commands.catalog';
import { defaultKeymap } from '../../input/keymap';
import { OverlayHost } from '../../overlay/OverlayHost';
import { createOverlayService, type OverlayService } from '../../overlay/overlayService';
import { registerAsyncSearchSource, registerSearchSource, type SearchHit } from '../../registries/search';
import { openJumpMenu } from './JumpMenu';
import { SEARCH_DEBOUNCE_MS, SEARCH_WAIT_MS } from './useJumpSearch';

let service: OverlayService;
let cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  service = createOverlayService();
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  cleanups.forEach((fn) => fn());
  cleanups = [];
  vi.useRealTimers();
});

const hit = (title: string, group: string, run: () => void = () => {}): SearchHit => ({ group, title, run });

/** A promise the test settles. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function open() {
  render(<OverlayHost service={service} />);
  act(() => void openJumpMenu({ service, catalog: COMMAND_CATALOG, keymap: defaultKeymap(COMMAND_CATALOG, false), runCommand: () => {} }));
}
const field = () => screen.getByRole('combobox');
const type = (value: string) => act(() => void fireEvent.change(field(), { target: { value } }));
const names = () => screen.queryAllByRole('option').map((option) => option.textContent ?? '');
const status = () => within(screen.getByRole('dialog')).getByRole('status').textContent;
const settle = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('the jump menu with a source that answers later', () => {
  it('shows a waiting row in the source’s place at once, asks once the typing pauses, then lists the answer there', async () => {
    const asked = vi.fn((term: string) => Promise.resolve([hit(`${term} in chapter 9`, 'In the script')]));
    cleanups.push(
      registerAsyncSearchSource(asked, 'In the script'),
      registerSearchSource((term) => [hit(`${term} in my marks`, 'My marks')]),
    );
    open();
    type('rabbit');
    // The synchronous source answers in the same render, as before; the later one has a waiting row above it, where it registered.
    expect(names()).toEqual(['Searching…', 'rabbit in my marks']);
    expect(screen.getAllByRole('option')[0]?.getAttribute('aria-disabled')).toBe('true');
    expect(asked).not.toHaveBeenCalled();
    await settle(SEARCH_DEBOUNCE_MS);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(asked.mock.calls[0]?.[0]).toBe('rabbit');
    expect(names()).toEqual(['rabbit in chapter 9', 'rabbit in my marks']);
  });

  it('asks only for the term typed last, and drops an answer to an earlier term', async () => {
    const answers = new Map<string, ReturnType<typeof deferred<SearchHit[]>>>();
    const signals: AbortSignal[] = [];
    cleanups.push(
      registerAsyncSearchSource((term, signal) => {
        signals.push(signal);
        const answer = deferred<SearchHit[]>();
        answers.set(term, answer);
        return answer.promise;
      }, 'In the script'),
    );
    open();
    type('ra');
    await settle(SEARCH_DEBOUNCE_MS - 1);
    type('rab');
    await settle(SEARCH_DEBOUNCE_MS);
    // "ra" never reached the source: the typing had not paused.
    expect([...answers.keys()]).toEqual(['rab']);
    type('rabbit');
    await settle(SEARCH_DEBOUNCE_MS);
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
    // The late answer to "rab" arrives after "rabbit" was asked: it is not shown.
    await act(async () => answers.get('rab')?.resolve([hit('stale rab', 'In the script')]));
    expect(names()).toEqual(['Searching…']);
    await act(async () => answers.get('rabbit')?.resolve([hit('fresh rabbit', 'In the script')]));
    expect(names()).toEqual(['fresh rabbit']);
  });

  it('stops waiting after the bounded wait and says so in a toast, keeping the other hits', async () => {
    cleanups.push(
      registerAsyncSearchSource(() => new Promise<SearchHit[]>(() => {}), 'In the script'),
      registerSearchSource(() => [hit('a mark', 'My marks')]),
    );
    open();
    type('rabbit');
    await settle(SEARCH_DEBOUNCE_MS + SEARCH_WAIT_MS - 1);
    expect(names()).toEqual(['Searching…', 'a mark']);
    await settle(1);
    expect(names()).toEqual(['a mark']);
    expect(service.getSnapshot().toasts.map((toast) => [toast.text, toast.tone])).toEqual([
      ['Searching “In the script” took too long. Type the search again to retry.', 'error'],
    ]);
  });

  it('says a failed source in a toast with its reason, and a source that throws at once too', async () => {
    cleanups.push(
      registerAsyncSearchSource(() => Promise.reject(new Error('the search term is longer than 500 characters')), 'In the script'),
      registerAsyncSearchSource(() => {
        throw new Error('index not ready');
      }, 'Elsewhere'),
      registerSearchSource(() => [hit('a mark', 'My marks')]),
    );
    open();
    type('rabbit');
    await settle(SEARCH_DEBOUNCE_MS);
    expect(names()).toEqual(['a mark']);
    expect(service.getSnapshot().toasts.map((toast) => toast.text)).toEqual(
      expect.arrayContaining([
        "Couldn't search “In the script”: the search term is longer than 500 characters",
        "Couldn't search “Elsewhere”: index not ready",
      ]),
    );
  });

  it('tells a screen reader the count so far while a source is searching, then the whole count', async () => {
    const answer = deferred<SearchHit[]>();
    cleanups.push(
      registerAsyncSearchSource(() => answer.promise, 'In the script'),
      registerSearchSource(() => [hit('a mark', 'My marks')]),
    );
    open();
    type('rabbit');
    expect(status()).toBe('1 result so far. Still searching.');
    await settle(SEARCH_DEBOUNCE_MS);
    await act(async () => answer.resolve([hit('one', 'In the script'), hit('two', 'In the script')]));
    expect(status()).toBe('3 results');
  });

  it('keeps the active row on the hit it was on when an answer arrives above it, and Enter on a waiting row does nothing', async () => {
    const answer = deferred<SearchHit[]>();
    const chosen = vi.fn();
    cleanups.push(
      registerAsyncSearchSource(() => answer.promise, 'In the script'),
      registerSearchSource(() => [hit('a mark', 'My marks', chosen)]),
    );
    open();
    type('rabbit');
    act(() => void fireEvent.keyDown(field(), { key: 'Enter' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    act(() => void fireEvent.keyDown(field(), { key: 'ArrowDown' }));
    const activeId = field().getAttribute('aria-activedescendant');
    expect(activeId && document.getElementById(activeId)?.textContent).toContain('a mark');
    await settle(SEARCH_DEBOUNCE_MS);
    await act(async () => answer.resolve([hit('one', 'In the script'), hit('two', 'In the script')]));
    const after = field().getAttribute('aria-activedescendant');
    expect(after && document.getElementById(after)?.textContent).toContain('a mark');
    act(() => void fireEvent.keyDown(field(), { key: 'Enter' }));
    expect(chosen).toHaveBeenCalledTimes(1);
  });

  it('asks no later source for a > command search or a one-letter term', async () => {
    const asked = vi.fn(() => Promise.resolve([] as SearchHit[]));
    cleanups.push(registerAsyncSearchSource(asked, 'In the script'));
    open();
    type('>zoom');
    type('r');
    await settle(SEARCH_DEBOUNCE_MS + SEARCH_WAIT_MS);
    expect(asked).not.toHaveBeenCalled();
    expect(names()).not.toContain('Searching…');
  });
});
