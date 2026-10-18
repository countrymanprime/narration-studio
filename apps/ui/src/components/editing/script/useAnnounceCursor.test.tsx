// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { overlay } from '../../../overlay/overlayService';
import { EditingPageProvider, useEditingPage } from './EditingPageState';
import { marksDoc } from './scriptFixtures';
import { ANNOUNCE_SETTLE_MS, useAnnounceCursor } from './useAnnounceCursor';

let page: ReturnType<typeof useEditingPage>;
function Probe() {
  page = useEditingPage();
  useAnnounceCursor();
  return null;
}
const doc = marksDoc();
const words = doc.items.filter((i) => i.kind === 'w');
const extra = doc.items.find((i) => i.kind === 'x')!;
let said: string[];

beforeEach(() => {
  vi.useFakeTimers();
  said = [];
  vi.spyOn(overlay, 'announce').mockImplementation((text) => void said.push(text));
  render(
    <EditingPageProvider doc={doc}>
      <Probe />
    </EditingPageProvider>,
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const settle = () => act(() => void vi.advanceTimersByTime(ANNOUNCE_SETTLE_MS));
const place = (key: string) => act(() => page.dispatch({ type: 'place', key }));

describe('the cursor word is announced once it settles', () => {
  it('says nothing before the page is touched', () => {
    settle();
    expect(said).toEqual([]);
  });

  it('says the word the cursor moved to, after a pause', () => {
    place(words[2].key);
    expect(said).toEqual([]);
    settle();
    expect(said).toEqual([words[2].text]);
  });

  it('says only the last word while a key is held down', () => {
    for (const w of words.slice(0, 6)) {
      place(w.key);
      act(() => void vi.advanceTimersByTime(ANNOUNCE_SETTLE_MS / 5));
    }
    expect(said).toEqual([]);
    settle();
    expect(said).toEqual([words[5].text]);
  });

  it('says a word again when the cursor comes back to it', () => {
    place(words[1].key);
    settle();
    place(words[2].key);
    settle();
    place(words[1].key);
    settle();
    expect(said).toEqual([words[1].text, words[2].text, words[1].text]);
  });

  it('says that a word that was only said is not in the script', () => {
    place(extra.key);
    settle();
    expect(said).toEqual([`${extra.text}, not in the script`]);
  });
});

describe('a selection is announced once it settles', () => {
  it('says the size of the selection that the keys settled on, not each step', () => {
    place(words[0].key);
    for (const w of words.slice(1, 4)) {
      act(() => page.dispatch({ type: 'extend', key: w.key }));
      act(() => void vi.advanceTimersByTime(ANNOUNCE_SETTLE_MS / 5));
    }
    settle();
    expect(said.filter((s) => s.includes('selected'))).toEqual([expect.stringMatching(/^4 words selected/)]);
    expect(said).toHaveLength(1);
  });

  it('says the selection is cleared when Escape lets it go and the cursor stays', () => {
    place(words[0].key);
    act(() => page.dispatch({ type: 'extend', key: words[2].key }));
    settle();
    said.length = 0;
    act(() => page.dispatch({ type: 'clear' }));
    settle();
    expect(said).toEqual(['Selection cleared']);
  });

  it('says the word when a plain move collapses the selection', () => {
    place(words[0].key);
    act(() => page.dispatch({ type: 'extend', key: words[2].key }));
    settle();
    said.length = 0;
    place(words[3].key);
    settle();
    expect(said).toEqual([words[3].text]);
  });
});

describe('what it leaves to others', () => {
  it('stays quiet while a flag card is open, because the card says its own label', () => {
    const flagged = doc.items.find((i) => i.st !== 'ok' && i.st !== 'extra' && i.kind === 'w');
    if (!flagged) return;
    place(flagged.key);
    act(() => page.dispatch({ type: 'openFlag', key: flagged.key }));
    settle();
    expect(said).toEqual([]);
  });

  it('does not say a pending word after unmount', () => {
    place(words[2].key);
    cleanup();
    settle();
    expect(said).toEqual([]);
  });
});
