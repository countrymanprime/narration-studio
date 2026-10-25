// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { overlay } from '../../../overlay/overlayService';
import { EditingPageProvider, useEditingPage } from './EditingPageState';
import { NO_TEXT, ScriptDoc, type ScriptDocProps } from './ScriptDoc';
import { docFromHeard } from './docFromHeard';
import { ANNOUNCE_SETTLE_MS } from './useAnnounceCursor';
import { marksDoc, notTranscribed, PARAS } from './scriptFixtures';
import type { ChapterDoc } from '../model';
import type { PageState } from './scriptState';

afterEach(cleanup);

let page: ReturnType<typeof useEditingPage>;
function Probe() {
  page = useEditingPage();
  return null;
}
const state = (): PageState => page.state;

function show(doc: ChapterDoc, props: ScriptDocProps = {}) {
  return render(
    <EditingPageProvider doc={doc}>
      <Probe />
      <ScriptDoc {...props} />
    </EditingPageProvider>,
  );
}
const word = (key: string): HTMLElement => document.querySelector<HTMLElement>(`[data-k="${key}"]`)!;
const scriptWords = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[data-k][data-kind="w"]')];

describe('words-are-read-only-and-keyed', () => {
  it('draws one element per word with its document key, nothing editable, and the script text', () => {
    const doc = marksDoc();
    show(doc);
    expect([...document.querySelectorAll('[data-k]')].map((e) => (e as HTMLElement).dataset.k)).toEqual(doc.items.map((i) => i.key));
    expect(document.querySelector('[contenteditable]')).toBeNull();
    expect(document.querySelector('input,textarea')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Script with what was heard' }).getAttribute('aria-readonly')).toBe('true');
    const [p1, p2] = [...document.querySelectorAll('[data-pid]')];
    expect(
      scriptWords()
        .filter((e) => p1.contains(e))
        .map((e) => e.textContent)
        .join(' '),
    ).toBe(PARAS[0].text);
    expect(
      scriptWords()
        .filter((e) => p2.contains(e))
        .map((e) => e.textContent)
        .join(' '),
    ).toBe(PARAS[1].text);
  });
});

describe('marks-are-not-colour-alone', () => {
  it('gives an extra word, a word not read, a misread and a low-confidence word a shape and a description', () => {
    show(marksDoc());
    const um = document.querySelector<HTMLElement>('[data-mark="extra"]')!;
    expect(um.textContent).toBe('um');
    expect(um.style.fontStyle).toBe('italic');
    expect(um.style.boxShadow).toContain('var(--danger)');
    expect(um.getAttribute('aria-description')).toMatch(/^Not in the script, \d+:\d\d, 90%$/);
    const miss = document.querySelector<HTMLElement>('[data-mark="miss"]')!;
    expect(miss.textContent).toBe('very');
    expect(miss.style.outline).toContain('dashed');
    expect(miss.getAttribute('aria-description')).toBe('In the script, not read');
    const mis = document.querySelector<HTMLElement>('[data-mark="mis"]')!;
    expect(mis.getAttribute('aria-description')).toMatch(/^Heard “sitter”, \d+%$/);
    expect(mis.style.textDecoration).toContain('wavy');
    const low = document.querySelector<HTMLElement>('[data-mark="low"]')!;
    expect(low.textContent).toBe('tired');
    expect(low.style.textDecoration).toContain('solid');
    expect(low.getAttribute('aria-description')).toBe('Low confidence 50%');
  });
});

// Issue #2251 item 30: words said again are a second read, drawn and named as a repeat, not as words outside the script.
describe('a-second-read-is-a-repeat', () => {
  it('draws the words of a doubled read with the repeat kind’s double underline and names them Read twice', () => {
    const doc = marksDoc();
    const um = doc.items.find((i) => i.st === 'extra')!;
    um.dup = true;
    show(doc);
    expect(document.querySelector('[data-mark="extra"]')).toBeNull();
    const again = document.querySelector<HTMLElement>('[data-mark="dup"]')!;
    expect(again.textContent).toBe('um');
    expect(again.style.textDecoration).toContain('double');
    expect(again.getAttribute('aria-description')).toMatch(/^Read twice: said again, \d+:\d\d, 90%$/);
  });
});

describe('a mark yields to the layers drawn on the same word', () => {
  it('keeps the extra bar under a selection and an effect underline, and lets a cursor ring replace the dashed box', () => {
    show(marksDoc({ effects: [{ id: 'fx1', keys: ['p-1:0'] }] }));
    const um = document.querySelector<HTMLElement>('[data-mark="extra"]')!;
    act(() => page.dispatch({ type: 'select', head: um.dataset.k!, anchor: um.dataset.k! }));
    expect(um.style.boxShadow).toContain('var(--info)');
    expect(um.style.boxShadow).toContain('var(--danger)');
    expect(um.style.background).toBe('');
    const miss = document.querySelector<HTMLElement>('[data-mark="miss"]')!;
    act(() => page.dispatch({ type: 'place', key: miss.dataset.k! }));
    expect(miss.style.outline).toBe('');
    expect(miss.className).toContain('outline-[var(--focus)]');
  });
});

describe('not-transcribed-state', () => {
  it("draws plain text with no marks and the pill with the host's reason", () => {
    const answer = notTranscribed();
    show(docFromHeard(PARAS, answer), { reason: answer.heard ? null : answer.reason });
    expect(screen.getByText('Not transcribed yet')).toBeTruthy();
    expect(screen.getByText(/Nothing has been transcribed yet/)).toBeTruthy();
    expect(document.querySelector('[data-mark]')).toBeNull();
    expect(scriptWords()).toHaveLength(PARAS.flatMap((p) => p.text.split(' ')).length);
  });
  it('shows no pill once words were heard', () => {
    show(marksDoc());
    expect(screen.queryByText('Not transcribed yet')).toBeNull();
  });
  it('offers Check recording beside the pill, and a press asks the page to check', () => {
    const onCheckRecording = vi.fn();
    const answer = notTranscribed();
    show(docFromHeard(PARAS, answer), { reason: answer.heard ? null : answer.reason, onCheckRecording });
    fireEvent.click(screen.getByRole('button', { name: 'Check recording' }));
    expect(onCheckRecording).toHaveBeenCalledTimes(1);
  });
  it('offers no check without a way to run one, once words were heard, or when the page already says there is no audio', () => {
    const answer = notTranscribed();
    show(docFromHeard(PARAS, answer));
    expect(screen.queryByRole('button', { name: 'Check recording' })).toBeNull();
    cleanup();
    show(marksDoc(), { onCheckRecording: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Check recording' })).toBeNull();
    cleanup();
    show(docFromHeard(PARAS, answer), { explained: true, onCheckRecording: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Check recording' })).toBeNull();
  });
});

// R3ED-15: with nothing heard there are no times or takes, so the 76 px time gutter is not kept as an empty indent.
describe('the time gutter', () => {
  it('is drawn for a transcribed chapter', () => {
    show(marksDoc());
    const row = document.querySelector<HTMLElement>('[data-pid]')!;
    expect(row.className).toContain('grid-cols-[76px_minmax(0,1000px)]');
    expect(row.querySelector('[data-gutter]')!.className).not.toContain('invisible');
  });
  it('is dropped when nothing was transcribed', () => {
    const answer = notTranscribed();
    show(docFromHeard(PARAS, answer), { reason: null });
    const row = document.querySelector<HTMLElement>('[data-pid]')!;
    expect(row.className).toContain('grid-cols-[0px_minmax(0,1000px)]');
    expect(row.querySelector('[data-gutter]')!.className).toContain('invisible');
  });
});

describe('empty-chapter-state', () => {
  it('says there is no text and draws no script element', () => {
    show(docFromHeard([], notTranscribed()));
    expect(screen.getByText(NO_TEXT)).toBeTruthy();
    expect(document.querySelector('[data-script]')).toBeNull();
  });
});

describe('click-shift-click-drag-and-double-click', () => {
  const keys = marksDoc().items.map((i) => i.key);
  it('a click puts the cursor on a word', () => {
    show(marksDoc());
    fireEvent.mouseDown(word(keys[2]));
    expect(state()).toMatchObject({ cursor: keys[2], sel: null });
    expect(word(keys[2]).hasAttribute('data-cursor')).toBe(true);
  });
  it('Shift+click extends from the cursor, and stays inside the text at the ends', () => {
    show(marksDoc());
    fireEvent.mouseDown(word(keys[1]));
    fireEvent.mouseDown(word(keys[4]), { shiftKey: true });
    expect(state().sel).toEqual({ anchor: keys[1], head: keys[4] });
    expect(document.querySelectorAll('[data-sel]')).toHaveLength(4);
    fireEvent.mouseDown(word(keys[keys.length - 1]), { shiftKey: true });
    expect(document.querySelectorAll('[data-sel]')).toHaveLength(keys.length - 1);
  });
  it('a drag selects whole words, and either direction gives the same run', () => {
    const drag = (from: string, to: string): string[] => {
      cleanup();
      show(marksDoc());
      fireEvent.mouseDown(word(from), { clientX: 100, clientY: 100 });
      fireEvent.mouseOver(word(to), { buttons: 1, clientX: 140, clientY: 100 });
      fireEvent.mouseUp(document);
      return [...document.querySelectorAll<HTMLElement>('[data-sel]')].map((e) => e.dataset.k!);
    };
    const forward = drag(keys[1], keys[5]);
    expect(forward).toEqual(keys.slice(1, 6));
    expect(drag(keys[5], keys[1])).toEqual(forward);
  });
  it('a click with a little movement over the next word is still a click, not a drag', () => {
    // A slow page can deliver the pointer's small wobble over a neighbouring word before the button-up: only a real drag selects.
    show(marksDoc());
    fireEvent.mouseDown(word(keys[1]), { clientX: 100, clientY: 100 });
    fireEvent.mouseOver(word(keys[2]), { buttons: 1, clientX: 102, clientY: 101 });
    fireEvent.mouseUp(document);
    expect(state()).toMatchObject({ cursor: keys[1], sel: null });
    expect(document.querySelectorAll('[data-sel]')).toHaveLength(0);
  });
  it('moving past the slop starts the drag from the word that was pressed', () => {
    show(marksDoc());
    fireEvent.mouseDown(word(keys[1]), { clientX: 100, clientY: 100 });
    fireEvent.mouseOver(word(keys[2]), { buttons: 1, clientX: 102, clientY: 101 });
    expect(state().sel).toBeNull();
    fireEvent.mouseOver(word(keys[4]), { buttons: 1, clientX: 130, clientY: 100 });
    expect(state().sel).toEqual({ anchor: keys[1], head: keys[4] });
  });
  it('a drag does nothing once the button is up', () => {
    show(marksDoc());
    fireEvent.mouseDown(word(keys[1]));
    fireEvent.mouseUp(document);
    fireEvent.mouseOver(word(keys[5]), { buttons: 1 });
    expect(state().sel).toBeNull();
  });
  it('a double click selects one word', () => {
    show(marksDoc());
    fireEvent.mouseDown(word(keys[3]), { detail: 2 });
    expect(state().sel).toEqual({ anchor: keys[3], head: keys[3] });
    expect(document.querySelectorAll('[data-sel]')).toHaveLength(1);
  });
  it('a click on a misread opens its card; on an extra word it does not', () => {
    const doc = marksDoc();
    show(doc);
    const mis = doc.items.find((i) => i.st === 'mis')!.key;
    fireEvent.mouseDown(word(mis));
    expect(state().flag).toBe(mis);
    fireEvent.mouseDown(word(doc.items.find((i) => i.st === 'extra')!.key));
    expect(state().flag).toBeNull();
  });
  it('selecting a word puts the cursor there', () => {
    show(marksDoc());
    fireEvent.mouseDown(word(keys[0]));
    fireEvent.mouseDown(word(keys[3]), { shiftKey: true });
    expect(state().cursor).toBe(keys[3]);
  });
});

describe('selection-is-announced', () => {
  it('speaks the count and the time range through the overlay announcer once the pointer has settled', () => {
    vi.useFakeTimers();
    const said: string[] = [];
    vi.spyOn(overlay, 'announce').mockImplementation((text) => void said.push(text));
    const doc = marksDoc();
    show(doc);
    const keys = doc.items.map((i) => i.key);
    fireEvent.mouseDown(word(keys[0]));
    fireEvent.mouseDown(word(keys[2]), { shiftKey: true });
    act(() => void vi.advanceTimersByTime(ANNOUNCE_SETTLE_MS));
    expect(said).toEqual([expect.stringMatching(/^3 words selected, \d+:\d\d to \d+:\d\d$/)]);
    fireEvent.mouseDown(word(doc.items.find((i) => i.st === 'extra')!.key), { detail: 2 });
    act(() => void vi.advanceTimersByTime(ANNOUNCE_SETTLE_MS));
    expect(said.at(-1)).toMatch(/not in the script$/);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps no live region of its own, so the overlay announcer is the one voice', () => {
    show(marksDoc());
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('stale keys', () => {
  it("resets the page state when the document no longer has the cursor's word", () => {
    const doc = marksDoc();
    const view = show(doc);
    fireEvent.mouseDown(word(doc.items[2].key));
    expect(state().cursor).toBe(doc.items[2].key);
    view.rerender(
      <EditingPageProvider doc={docFromHeard([PARAS[1]], notTranscribed())}>
        <Probe />
        <ScriptDoc />
      </EditingPageProvider>,
    );
    expect(state().cursor).toBeNull();
  });
});

describe('paragraphs-are-memoised', () => {
  it('moving the cursor within a paragraph draws only that paragraph, and moving out draws it and the one it entered', () => {
    const paragraphs = Array.from({ length: 200 }, (_, i) => ({ id: `m-${i}`, text: 'one two three four five six' }));
    const doc = docFromHeard(paragraphs, notTranscribed());
    const drawn: string[] = [];
    show(doc, { onParagraphRender: (pid) => drawn.push(pid) });
    const key = (p: number, w: number): string => `m-${p}:${w}`;
    drawn.length = 0;
    fireEvent.mouseDown(word(key(7, 0)));
    expect(new Set(drawn)).toEqual(new Set(['m-7']));
    drawn.length = 0;
    fireEvent.mouseDown(word(key(7, 3)));
    expect(new Set(drawn)).toEqual(new Set(['m-7']));
    drawn.length = 0;
    fireEvent.mouseDown(word(key(120, 1)));
    expect(new Set(drawn)).toEqual(new Set(['m-7', 'm-120']));
  });
});

describe('struck-and-marked-words-are-drawn-from-the-document', () => {
  it('strikes a cut word and keeps it in the text; draws an effect underline and its marker', () => {
    const cutKey = 'p-2:1';
    const doc = marksDoc({
      cuts: [{ id: 'c1', a: 0, b: 0.1, mode: 'gap', keys: [cutKey], off0: 0, off1: 0.1 }],
      effects: [{ id: 'fx1', keys: ['p-2:3', 'p-2:4'] }],
    });
    show(doc);
    const cut = word(cutKey);
    expect(cut.textContent).toBe('or');
    expect(cut.dataset.mark).toBe('cut');
    expect(cut.className).toContain('line-through');
    expect(cut.getAttribute('aria-description')).toBe('Cut from the audio');
    expect(word('p-2:3').style.boxShadow).toContain('inset 0 -3px 0');
    expect(word('p-2:4').style.boxShadow).toContain('inset 0 -3px 0');
    const markers = document.querySelectorAll('[data-fx-marker]');
    expect(markers).toHaveLength(1);
    expect(markers[0].getAttribute('aria-label')).toBe('Effect on the words before');
    expect(word('p-2:4').nextElementSibling).toBe(markers[0]);
  });
});

describe('the playing word', () => {
  it('is drawn lit from playT, and the paragraph it is in is the active one', () => {
    const doc = marksDoc();
    show(doc);
    const target = doc.items.find((i) => i.pid === 'p-2' && i.t0 != null)!;
    act(() => page.dispatch({ type: 'play', t: (target.t0 as number) + 0.01 }));
    expect(document.querySelector('[data-now]')).toBe(word(target.key));
    expect(document.querySelector('[data-pid="p-2"]')!.hasAttribute('data-active')).toBe(true);
  });
});

// Scrolling the bottom waveform by hand moves the page with it: the lines on screen there are marked, and the first is brought into view.
describe('the script follows the scrolled waveform', () => {
  it('marks the lines in the view and scrolls to the first, and lets them go when the cursor moves', () => {
    const doc = marksDoc();
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    show(doc);
    const second = doc.paras[1];
    act(() => page.dispatch({ type: 'view', t0: (second.start as number) + 0.1, t1: (second.end as number) - 0.1 }));
    const marked = [...document.querySelectorAll('[data-in-view]')].map((e) => e.getAttribute('data-pid'));
    expect(marked).toEqual([second.p.id]);
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' });
    act(() => page.dispatch({ type: 'place', key: doc.paras[0].items[0].key }));
    expect(document.querySelectorAll('[data-in-view]')).toHaveLength(0);
  });
  it('marks every line a zoomed-out view reaches', () => {
    const doc = marksDoc();
    show(doc);
    act(() => page.dispatch({ type: 'view', t0: 0, t1: 1e6 }));
    expect(document.querySelectorAll('[data-in-view]').length).toBe(doc.paras.filter((p) => p.start != null && p.end != null).length);
  });
});
