// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import { contextItemsFor } from '../../../registries/context';
import type { ContextMenuItem } from '../../primitives/ContextMenu';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { sameClock, type ItemClocks } from './docClock';
import { rangeDoc } from './rangeFixtures';
import { docEnd, WaveDock } from './WaveDock';

afterEach(cleanup);

/** 50 buckets a second over 20 s, the host's resolution. */
const peaks: WorkspacePeaks = (() => {
  const n = 1000;
  const bytes = new Uint8Array(n * 2);
  for (let i = 0; i < n; i += 1) {
    bytes[2 * i] = 256 - 40;
    bytes[2 * i + 1] = 40;
  }
  return { startSeconds: 0, bucketsPerSecond: 50, buckets: n, minMax: btoa(String.fromCharCode(...bytes)), sampleRate: 48000, channels: 1 };
})();

// rangeFixtures.ts: p-0 is one word, 0 to 3.55 s; p-1 runs 5.0 to 7.75 s (Alice 5.0-5.3, was, tired, of, sitting 6.2-6.5, ...), its window to
// 8.1 s, which is also where the recording ends. The waveform is 1000 px wide, so while p-1's whole window shows a pixel is 3.1 ms.
const doc = rangeDoc();
const xAt = (t: number, view = { start: 5, len: 3.1 }): number => ((t - view.start) / view.len) * 1000;

let page: ReturnType<typeof useEditingPage>;
function Probe() {
  page = useEditingPage();
  return null;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const wide = this.hasAttribute('data-ribbon-surface');
    return { left: 0, top: 0, right: wide ? 1000 : 0, bottom: 56, width: wide ? 1000 : 0, height: 56, x: 0, y: 0, toJSON: () => ({}) };
  };
});

function mount({ clocks = sameClock([0]), playFrom }: { clocks?: ItemClocks; playFrom?: (from: number, to?: number) => void } = {}) {
  const api = { ...createMockApi(), workspacePeaks: async (chapterId: string) => ({ chapterId, items: [{ index: 0, peaks }] }) };
  const view = render(
    <ApiProvider api={api}>
      <EditingPageProvider doc={doc}>
        <Probe />
        <WaveDock chapterId="chapter-1" clocks={clocks} take={null} playFrom={playFrom} />
      </EditingPageProvider>
    </ApiProvider>,
  );
  act(() => page.dispatch({ type: 'place', key: 'p-1:0' }));
  return view;
}
const surface = (): HTMLElement => document.querySelector('[data-ribbon-surface]') as HTMLElement;
const ready = () => waitFor(() => expect(surface()).toBeTruthy());
const label = () => document.querySelector('[data-view-label]')?.textContent;
const items = (): ContextMenuItem[] => contextItemsFor(surface()) ?? [];
const item = (key: string): ContextMenuItem | undefined => items().find((i) => i.key === key);

describe('the dock spans the chapter', () => {
  it('ends where the last line’s window ends', () => {
    expect(docEnd(doc)).toBeCloseTo(8.1, 6);
  });
});

describe('the right button scrolls', () => {
  it('right-drag drags the audio along, draws no range, and tells the page what is on screen', async () => {
    mount();
    await ready();
    expect(label()).toBe('0:05.00 to 0:08.10');
    fireEvent.pointerDown(surface(), { clientX: 500, button: 2, pointerId: 1 });
    fireEvent.pointerMove(surface(), { clientX: 800, pointerId: 1 });
    fireEvent.pointerUp(surface(), { clientX: 800, pointerId: 1, button: 2 });
    // 300 px of a 1000 px waveform showing 3.1 s brings 0.93 s of earlier audio in from the left.
    expect(label()).toBe('0:04.07 to 0:07.17');
    expect(screen.queryByRole('slider', { name: 'Start of range' })).toBeNull();
    expect(page.state.view?.t0).toBeCloseTo(4.07, 6);
    expect(page.state.view?.t1).toBeCloseTo(7.17, 6);
    expect(page.state.span ?? null).toBeNull();
  });

  it('a wobble under the slop is not a scroll', async () => {
    mount();
    await ready();
    fireEvent.pointerDown(surface(), { clientX: 500, button: 2, pointerId: 1 });
    fireEvent.pointerMove(surface(), { clientX: 497, pointerId: 1 });
    fireEvent.pointerUp(surface(), { clientX: 497, pointerId: 1, button: 2 });
    expect(label()).toBe('0:05.00 to 0:08.10');
    expect(page.state.view ?? null).toBeNull();
  });

  it('moving the cursor lets the scrolled view go, and the waveform shows the cursor line again', async () => {
    mount();
    await ready();
    fireEvent.pointerDown(surface(), { clientX: 0, button: 2, pointerId: 1 });
    fireEvent.pointerMove(surface(), { clientX: 1000, pointerId: 1 });
    fireEvent.pointerUp(surface(), { clientX: 1000, pointerId: 1, button: 2 });
    expect(label()).toBe('0:01.90 to 0:05.00');
    act(() => page.dispatch({ type: 'place', key: 'p-1:4' }));
    expect(page.state.view ?? null).toBeNull();
    expect(label()).toBe('0:05.00 to 0:08.10');
  });
});

describe('a right click without a drag opens the waveform’s own menu', () => {
  it('where the menu event comes with the button-down (Linux, macOS), it is held back and sent again at the button-up', async () => {
    mount();
    await ready();
    const sent = vi.fn();
    surface().addEventListener('contextmenu', sent);
    fireEvent.pointerDown(surface(), { clientX: xAt(6.35), button: 2, pointerId: 1 });
    expect(fireEvent.contextMenu(surface(), { clientX: xAt(6.35), button: 2 })).toBe(false);
    sent.mockClear();
    fireEvent.pointerUp(surface(), { clientX: xAt(6.35), pointerId: 1, button: 2 });
    expect(sent).toHaveBeenCalledTimes(1);
    expect(item('play-here')?.label).toBe('Play from 0:06.35');
    expect(item('cursor-here')?.label).toBe('Put the cursor on “sitting”');
  });

  it('where it comes after the button-up (Windows), a click lets it through and a drag swallows it', async () => {
    mount();
    await ready();
    fireEvent.pointerDown(surface(), { clientX: 500, button: 2, pointerId: 1 });
    fireEvent.pointerUp(surface(), { clientX: 500, pointerId: 1, button: 2 });
    expect(fireEvent.contextMenu(surface(), { clientX: 500, button: 2 })).toBe(true);
    fireEvent.pointerDown(surface(), { clientX: 500, button: 2, pointerId: 1 });
    fireEvent.pointerMove(surface(), { clientX: 700, pointerId: 1 });
    fireEvent.pointerUp(surface(), { clientX: 700, pointerId: 1, button: 2 });
    expect(fireEvent.contextMenu(surface(), { clientX: 700, button: 2 })).toBe(false);
  });

  it('has its own items and not the shell’s, and each does what it says', async () => {
    const playFrom = vi.fn();
    mount({ playFrom });
    await ready();
    fireEvent.contextMenu(surface(), { clientX: xAt(6.35), button: 2 });
    expect(items().map((i) => i.key)).toEqual(['play-here', 'cursor-here', 'select-line', 'zoom-in', 'zoom-out', 'show-line', 'show-all']);
    act(() => item('play-here')!.onSelect());
    expect(playFrom).toHaveBeenCalledWith(6.35);
    act(() => item('select-line')!.onSelect());
    expect(page.state.sel).toEqual({ anchor: 'p-1:0', head: 'p-1:8' });
    act(() => item('cursor-here')!.onSelect());
    expect(page.state.cursor).toBe('p-1:4');
    // zoomed about 6.35 s, which stays where it was on screen
    act(() => item('zoom-in')!.onSelect());
    expect(label()).toBe('0:05.48 to 0:07.48');
    act(() => item('show-all')!.onSelect());
    expect(label()).toBe('0:00.00 to 0:08.10');
    act(() => item('show-line')!.onSelect());
    expect(label()).toBe('0:05.00 to 0:08.10');
  });

  it('offers to play and clear a range when there is one', async () => {
    const playFrom = vi.fn();
    mount({ playFrom });
    await ready();
    act(() => page.dispatch({ type: 'selectSpan', span: { start: 5.6, end: 6.2 }, anchor: 'p-1:2', head: 'p-1:3' }));
    fireEvent.contextMenu(surface(), { clientX: xAt(6), button: 2 });
    act(() => item('play-range')!.onSelect());
    expect(playFrom).toHaveBeenCalledWith(5.6, 6.2);
    act(() => item('clear-range')!.onSelect());
    expect(page.state.span ?? null).toBeNull();
  });

  it('from the keyboard (the menu key) it is about the view, and nothing plays where nothing can', async () => {
    mount();
    await ready();
    fireEvent.contextMenu(surface(), { button: 0 });
    fireEvent.contextMenu(surface(), { clientX: 0, button: 2 });
    expect(item('play-here')?.label).toBe('Play from 0:05.00');
    expect(item('play-here')?.unavailable).toBe('Nothing can play this chapter here.');
    expect(item('zoom-in')?.label).toBe('Zoom in');
  });

  it('says why a word or line item is off where no word is heard', async () => {
    mount();
    await ready();
    act(() => page.dispatch({ type: 'view', t0: 3, t1: 6.1 }));
    fireEvent.contextMenu(surface(), { clientX: 999, button: 2 });
    // 8.1 s is past the last word
    expect(item('cursor-here')?.unavailable).toBe('No word is heard here.');
  });
});

describe('touch', () => {
  const touch = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', id: number, x: number) =>
    fireEvent[type](surface(), { clientX: x, pointerId: id, pointerType: 'touch', button: type === 'pointerMove' ? -1 : 0 });

  it('one finger draws a range', async () => {
    mount();
    await ready();
    touch('pointerDown', 1, xAt(5.54));
    touch('pointerMove', 1, xAt(6.296));
    touch('pointerUp', 1, xAt(6.296));
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Start of range' })).toBeTruthy());
  });

  it('two fingers scroll, and the range the first finger began is let go', async () => {
    mount();
    await ready();
    touch('pointerDown', 1, 300);
    touch('pointerDown', 2, 500);
    touch('pointerMove', 1, 500);
    touch('pointerMove', 2, 700);
    touch('pointerUp', 1, 500);
    touch('pointerUp', 2, 700);
    expect(screen.queryByRole('slider', { name: 'Start of range' })).toBeNull();
    // the two fingers' middle moved 200 px: 0.62 s
    expect(label()).toBe('0:04.38 to 0:07.48');
  });
});

// The peaks are in the file's seconds and the dock's axis is the document's: each item's peaks go on the axis by its clock.
describe('the dock reads the peaks on the document clock', () => {
  const at = (shift: number): ItemClocks => new Map([[0, [{ from: -Infinity, to: Infinity, shift }]]]);
  it('draws the audio when the item sits under the lines on the axis', async () => {
    mount({ clocks: at(0) });
    await waitFor(() => expect(document.querySelector('[data-wave-dock] canvas')).not.toBeNull());
  });
  it('says the audio is elsewhere when the item, once shifted onto the axis, lies after the chapter', async () => {
    mount({ clocks: at(100) });
    await waitFor(() => expect(screen.getByText(/No audio to draw/)).toBeTruthy());
    expect(document.querySelector('[data-wave-dock] canvas')).toBeNull();
  });
  it('draws nothing for an item no word is heard on', async () => {
    mount({ clocks: new Map() });
    await waitFor(() => expect(screen.getByText(/No audio to draw/)).toBeTruthy());
  });
});

describe('labelled', () => {
  it('the waveform is a focusable group with its keys and help named, inside a named region', async () => {
    mount();
    await ready();
    expect(screen.getByRole('region', { name: 'Waveform of the chapter' })).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Waveform' });
    expect(group.getAttribute('tabindex')).toBe('0');
    expect(group.getAttribute('aria-keyshortcuts')).toContain('Shift+F10');
    expect(document.getElementById(group.getAttribute('aria-describedby')!)?.textContent).toMatch(/Right-drag, the wheel or two fingers scroll/);
  });
});
