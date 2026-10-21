// @vitest-environment jsdom
import { sameClock } from './docClock';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import type { DocItem } from '../model';
import { RangeNotes } from './RangeOverlay';
import { wordsCovered } from './rangeMath';
import { rangeDoc } from './rangeFixtures';
import { Ribbon } from './Ribbon';

afterEach(cleanup);

/** 50 buckets a second, the host's resolution (measure.DefaultPeaksPerSecond), over 20 s. */
const peaks: WorkspacePeaks = (() => {
  const n = 1000;
  const bytes = new Uint8Array(n * 2);
  for (let i = 0; i < n; i += 1) {
    bytes[2 * i] = 256 - 40;
    bytes[2 * i + 1] = 40;
  }
  return { startSeconds: 0, bucketsPerSecond: 50, buckets: n, minMax: btoa(String.fromCharCode(...bytes)), sampleRate: 48000, channels: 1 };
})();

// Paragraph p-1 (rangeFixtures.ts) runs 5.0 to 7.7 s: Alice 5.0-5.3, was 5.3-5.6, tired 5.6-5.9, of 5.9-6.2, sitting 6.2-6.5, quietly 6.5-6.8, by 6.8-7.1, her 7.1-7.4, sister 7.4-7.75.
// The line's window runs to 8.1 s: the last word's 7.75 s plus the 0.35 s runway the page keeps after a paragraph (editing/model/runway.ts).
// The waveform is 1000 px wide in these tests, so one pixel is 3.1 ms while the whole window shows.
const T0 = 5;
const LEN = 3.1;
const xAt = (t: number, view = { start: T0, len: LEN }): number => ((t - view.start) / view.len) * 1000;

let state: ReturnType<typeof useEditingPage>;
const doc = rangeDoc();

beforeEach(() => {
  // jsdom has no canvas: the drawing is checked in Ribbon.test.tsx, this file is about what sits over it.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const wide = this.hasAttribute('data-ribbon-surface') || this.hasAttribute('data-ribbon-pan');
    return { left: 0, top: 0, right: wide ? 1000 : 0, bottom: 56, width: wide ? 1000 : 0, height: 56, x: 0, y: 0, toJSON: () => ({}) };
  };
});

function Probe() {
  state = useEditingPage();
  return null;
}
function mount(start: 'cursor' | 'none' = 'cursor') {
  const api = {
    ...createMockApi(),
    workspacePeaks: async (chapterId: string) => ({ chapterId, items: [{ index: 0, peaks }] }),
  };
  const view = render(
    <ApiProvider api={api}>
      <EditingPageProvider doc={doc}>
        <Probe />
        <Ribbon chapterId="chapter-1" pid="p-1" clocks={sameClock([0])} />
      </EditingPageProvider>
    </ApiProvider>,
  );
  if (start === 'cursor') act(() => state.dispatch({ type: 'place', key: 'p-1:0' }));
  return view;
}
const surface = (): HTMLElement => document.querySelector('[data-ribbon-surface]') as HTMLElement;
const ready = () => waitFor(() => expect(surface()).toBeTruthy());
const startHandle = () => screen.getByRole('slider', { name: 'Start of range' });
const endHandle = () => screen.getByRole('slider', { name: 'End of range' });
const now = (el: HTMLElement): number => Number(el.getAttribute('aria-valuenow'));
const drag = (target: HTMLElement, from: number, to: number, init: Record<string, unknown> = {}) => {
  fireEvent.pointerDown(target, { clientX: from, button: 0, pointerId: 1, ...init });
  fireEvent.pointerMove(target, { clientX: to, pointerId: 1, ...init });
  fireEvent.pointerUp(target, { clientX: to, pointerId: 1, ...init });
};
const select = (anchor: string, head: string) => act(() => state.dispatch({ type: 'select', anchor, head }));

describe('the range on the waveform', () => {
  it('with a word selected the range is that word, with handles at its edges', async () => {
    mount();
    await ready();
    expect(now(startHandle())).toBeCloseTo(5, 6);
    expect(now(endHandle())).toBeCloseTo(5.3, 6);
  });

  it('with nothing selected there is no range and no handles', async () => {
    mount('none');
    act(() => state.dispatch({ type: 'play', t: 5.1 }));
    await ready();
    expect(screen.queryByRole('slider', { name: 'Start of range' })).toBeNull();
    expect(screen.getByText(/Drag on the waveform to choose a range/)).toBeTruthy();
  });

  it('selecting words sets the range to their span', async () => {
    mount();
    await ready();
    select('p-1:2', 'p-1:3');
    await waitFor(() => expect(now(startHandle())).toBeCloseTo(5.6, 6));
    expect(now(endHandle())).toBeCloseTo(6.2, 6);
  });

  it('a drag creates a range from the pointer-down to the pointer-up and selects the words it covers', async () => {
    mount();
    await ready();
    drag(surface(), xAt(5.54), xAt(6.296));
    await waitFor(() => expect(now(startHandle())).toBeCloseTo(5.54, 2));
    expect(now(endHandle())).toBeCloseTo(6.296, 2);
    // "tired" and "of" are covered; "was" is 20% covered and "sitting" 32%, so neither is selected
    expect(state.state.sel).toEqual({ anchor: 'p-1:2', head: 'p-1:3' });
    expect(state.state.span?.start).toBeCloseTo(5.54, 2);
  });

  it('a drag to the left makes the same range as one to the right', async () => {
    mount();
    await ready();
    drag(surface(), xAt(6.296), xAt(5.54));
    await waitFor(() => expect(now(startHandle())).toBeCloseTo(5.54, 2));
    expect(now(endHandle())).toBeCloseTo(6.296, 2);
  });

  it('a drag that goes past either end stops at the paragraph', async () => {
    mount();
    await ready();
    drag(surface(), xAt(7.0), 99999);
    await waitFor(() => expect(now(endHandle())).toBeCloseTo(8.1, 6));
    drag(surface(), xAt(5.5), -99999);
    await waitFor(() => expect(now(startHandle())).toBeCloseTo(5, 6));
    expect(now(endHandle())).toBeCloseTo(5.5, 2);
  });

  it('a tap with no drag puts the cursor on the word under it, and the range is that word', async () => {
    mount();
    await ready();
    select('p-1:2', 'p-1:3');
    await waitFor(() => expect(startHandle()).toBeTruthy());
    // 6.35 s is in "sitting", 6.2 to 6.5
    drag(surface(), xAt(6.35), xAt(6.35));
    await waitFor(() => expect(now(startHandle())).toBeCloseTo(6.2, 6));
    expect(now(endHandle())).toBeCloseTo(6.5, 6);
    expect(state.state.sel).toBeNull();
    expect(state.state.cursor).toBe('p-1:4');
    expect(state.state.span ?? null).toBeNull();
  });

  it('only the primary button draws a range', async () => {
    mount();
    await ready();
    fireEvent.pointerDown(surface(), { clientX: 100, button: 2, pointerId: 1 });
    fireEvent.pointerMove(surface(), { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(surface(), { clientX: 500, pointerId: 1 });
    expect(now(startHandle())).toBeCloseTo(5, 6);
    expect(now(endHandle())).toBeCloseTo(5.3, 6);
  });

  it('a handle moves its own edge and the words follow', async () => {
    mount();
    await ready();
    select('p-1:2', 'p-1:3');
    await waitFor(() => expect(now(endHandle())).toBeCloseTo(6.2, 6));
    drag(endHandle(), xAt(6.2), xAt(6.8));
    await waitFor(() => expect(now(endHandle())).toBeCloseTo(6.8, 2));
    expect(now(startHandle())).toBeCloseTo(5.6, 6);
    // 5.6 to 6.8 covers tired, of, sitting and quietly whole
    expect(state.state.sel?.head).toBe('p-1:5');
  });

  it('a handle stops a minimum short of the other one instead of crossing it', async () => {
    mount();
    await ready();
    select('p-1:2', 'p-1:3');
    await waitFor(() => expect(startHandle()).toBeTruthy());
    drag(startHandle(), xAt(5.6), xAt(7.5));
    await waitFor(() => expect(now(startHandle())).toBeCloseTo(6.15, 6));
    expect(now(endHandle())).toBeCloseTo(6.2, 6);
  });

  it('dragging inside the range moves all of it, keeping its width', async () => {
    mount();
    await ready();
    select('p-1:2', 'p-1:3');
    await waitFor(() => expect(startHandle()).toBeTruthy());
    const body = document.querySelector('[data-range-body]') as HTMLElement;
    drag(body, xAt(5.9), xAt(6.5));
    await waitFor(() => expect(now(startHandle())).toBeCloseTo(6.2, 2));
    expect(now(endHandle())).toBeCloseTo(6.8, 2);
    expect(state.state.sel).toEqual({ anchor: 'p-1:4', head: 'p-1:5' });
  });

  it('moving the range to the paragraph edge stops there', async () => {
    mount();
    await ready();
    select('p-1:2', 'p-1:3');
    await waitFor(() => expect(startHandle()).toBeTruthy());
    drag(document.querySelector('[data-range-body]') as HTMLElement, xAt(5.9), 99999);
    await waitFor(() => expect(now(endHandle())).toBeCloseTo(8.1, 6));
    expect(now(startHandle())).toBeCloseTo(7.5, 6);
  });
});

describe('snapping to word boundaries', () => {
  it('with Alt held, a drag snaps both edges to the nearest word boundary', async () => {
    mount();
    await ready();
    drag(surface(), xAt(5.54), xAt(6.296), { altKey: true });
    await waitFor(() => expect(now(startHandle())).toBeCloseTo(5.6, 6));
    expect(now(endHandle())).toBeCloseTo(6.2, 6);
    expect(screen.queryByText(/Sub-word edge/)).toBeNull();
  });

  it('with Alt held, a handle snaps; without it the handle goes where the pointer is', async () => {
    mount();
    await ready();
    select('p-1:2', 'p-1:3');
    await waitFor(() => expect(endHandle()).toBeTruthy());
    drag(endHandle(), xAt(6.2), xAt(6.62));
    await waitFor(() => expect(now(endHandle())).toBeCloseTo(6.62, 2));
    drag(endHandle(), xAt(6.62), xAt(6.62), { altKey: true });
    await waitFor(() => expect(now(endHandle())).toBeCloseTo(6.5, 6));
  });
});

describe('the keyboard', () => {
  it('Arrow keys nudge the focused edge by a step, Shift by ten steps, and stay off the page', async () => {
    mount();
    await ready();
    select('p-1:2', 'p-1:3');
    await waitFor(() => expect(endHandle()).toBeTruthy());
    const end = endHandle();
    // the view is 2.7 s: a step is a hundredth of it to the hundredth, 0.03 s
    expect(fireEvent.keyDown(end, { key: 'ArrowRight' })).toBe(false);
    expect(now(endHandle())).toBeCloseTo(6.23, 6);
    fireEvent.keyDown(end, { key: 'ArrowRight', shiftKey: true });
    expect(now(endHandle())).toBeCloseTo(6.53, 6);
    fireEvent.keyDown(end, { key: 'ArrowLeft' });
    expect(now(endHandle())).toBeCloseTo(6.5, 6);
    fireEvent.keyDown(startHandle(), { key: 'ArrowLeft' });
    expect(now(startHandle())).toBeCloseTo(5.57, 6);
    expect(state.state.span?.start).toBeCloseTo(5.57, 6);
  });

  it('a nudge keeps the minimum width and the paragraph bounds', async () => {
    mount();
    await ready();
    fireEvent.keyDown(startHandle(), { key: 'ArrowLeft', shiftKey: true });
    expect(now(startHandle())).toBeCloseTo(5, 6);
    fireEvent.keyDown(startHandle(), { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(startHandle(), { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(startHandle(), { key: 'ArrowRight', shiftKey: true });
    expect(now(startHandle())).toBeCloseTo(5.25, 6);
  });

  it('Alt with an arrow jumps the edge to the next word boundary', async () => {
    mount();
    await ready();
    select('p-1:2', 'p-1:3');
    await waitFor(() => expect(endHandle()).toBeTruthy());
    fireEvent.keyDown(endHandle(), { key: 'ArrowRight', altKey: true });
    expect(now(endHandle())).toBeCloseTo(6.5, 6);
    fireEvent.keyDown(endHandle(), { key: 'ArrowLeft', altKey: true });
    expect(now(endHandle())).toBeCloseTo(6.2, 6);
  });

  it('other keys are left alone for the page', async () => {
    mount();
    await ready();
    expect(fireEvent.keyDown(startHandle(), { key: 'Delete' })).toBe(true);
    expect(fireEvent.keyDown(startHandle(), { key: 'm' })).toBe(true);
  });
});

describe('what a screen reader hears', () => {
  it('names both handles, gives each its time, and names the range with its length and its words', async () => {
    mount();
    await ready();
    drag(surface(), xAt(5.54), xAt(6.296));
    await waitFor(() => expect(now(startHandle())).toBeCloseTo(5.54, 2));
    expect(startHandle().getAttribute('aria-valuetext')).toMatch(/^Start 0:05\.54, range 0:05\.54 to 0:06\.30, 0\.8 seconds, 2 words$/);
    expect(endHandle().getAttribute('aria-valuetext')).toMatch(/^End 0:06\.30, range 0:05\.54 to 0:06\.30, 0\.8 seconds, 2 words$/);
    expect(startHandle().getAttribute('aria-orientation')).toBe('horizontal');
    expect(Number(startHandle().getAttribute('aria-valuemin'))).toBe(5);
    expect(Number(startHandle().getAttribute('aria-valuemax'))).toBeCloseTo(6.296 - 0.05, 2);
    expect(Number(endHandle().getAttribute('aria-valuemax'))).toBeCloseTo(8.1, 6);
    expect(screen.getByRole('group', { name: /^Range 0:05\.54 to 0:06\.30, 0\.8 seconds, 2 words/ })).toBeTruthy();
  });

  it('announces a range once it is set, not at every move of the pointer', async () => {
    mount();
    await ready();
    const status = () => screen.getByRole('status').textContent;
    fireEvent.pointerDown(surface(), { clientX: xAt(5.54), button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface(), { clientX: xAt(6.296), pointerId: 1 });
    expect(status()).not.toMatch(/Range set/);
    fireEvent.pointerUp(surface(), { clientX: xAt(6.296), pointerId: 1 });
    await waitFor(() => expect(status()).toMatch(/^Range set: 0:05\.54 to 0:06\.30, 0\.8 seconds, 2 words\./));
  });

  it('has no axe violations with a range and zoomed in', async () => {
    const { container } = mount();
    await ready();
    drag(surface(), xAt(5.54), xAt(6.296));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('partial words are shown as they are', () => {
  it('names the word an edge cuts through and how much of it the range covers, and previews the sub-word edge', async () => {
    mount();
    await ready();
    drag(surface(), xAt(5.54), xAt(6.296));
    const note = await screen.findByText(/Sub-word edge, shown as a preview/);
    expect(note.textContent).toContain('0:05.54 to 0:06.30');
    expect(note.textContent).toContain('0:05.60 to 0:06.20');
    const partial = screen.getByTestId('range-partial');
    expect(partial.textContent).toBe('Start: covers the last 20% of “was” (not selected). End: covers the first 32% of “sitting” (not selected).');
  });

  it('says nothing about sub-word edges when the range sits on whole words', async () => {
    mount();
    await ready();
    select('p-1:2', 'p-1:3');
    await waitFor(() => expect(startHandle()).toBeTruthy());
    expect(screen.queryByText(/Sub-word edge/)).toBeNull();
    expect(screen.queryByTestId('range-partial')).toBeNull();
  });

  it('a range inside one word selects that word and says how little of it the range covers', async () => {
    mount();
    await ready();
    drag(surface(), xAt(7.5), xAt(7.55));
    await waitFor(() => expect(state.state.sel).toEqual({ anchor: 'p-1:8', head: 'p-1:8' }));
    expect(screen.getByTestId('range-partial').textContent).toBe('Covers 14% of “sister” (selected).');
  });

  it('says so when a range covers no words, which a gap between words allows', () => {
    const words = [
      { key: 'g:0', text: 'one', t0: 0, t1: 1, st: 'ok' },
      { key: 'g:1', text: 'two', t0: 2, t1: 3, st: 'ok' },
    ] as unknown as DocItem[];
    const span = { start: 1.2, end: 1.8 };
    render(<RangeNotes shown={span} covered={wordsCovered(words, span)} words={words} />);
    expect(screen.getByText(/This range covers no words\./)).toBeTruthy();
  });
});

describe('zoom', () => {
  it('has zoom out and zoom in buttons that step 3.1 s, 2 s, 1 s and stop there', async () => {
    mount();
    await ready();
    const label = () => document.querySelector('[data-view-label]')?.textContent;
    expect(label()).toBe('0:05.00 to 0:08.10');
    const zin = screen.getByRole('button', { name: 'Zoom in' });
    fireEvent.click(zin);
    expect(label()).toBe('0:05.55 to 0:07.55');
    fireEvent.click(zin);
    expect(label()).toBe('0:06.05 to 0:07.05');
    expect(zin.getAttribute('aria-disabled') ?? zin.hasAttribute('disabled')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(label()).toBe('0:05.55 to 0:07.55');
  });

  it('draws the range and reads the pointer against the zoomed view', async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    const view = { start: 6.05, len: 1 };
    drag(surface(), xAt(6.1, view), xAt(6.4, view));
    await waitFor(() => expect(now(startHandle())).toBeCloseTo(6.1, 2));
    expect(now(endHandle())).toBeCloseTo(6.4, 2);
    expect(startHandle().hasAttribute('data-offscreen')).toBe(false);
  });

  it('control-wheel zooms about the pointer, and a plain vertical wheel is left to the page', async () => {
    mount();
    await ready();
    const label = () => document.querySelector('[data-view-label]')?.textContent;
    expect(fireEvent.wheel(surface(), { deltaY: 100, clientX: 500 })).toBe(true);
    expect(label()).toBe('0:05.00 to 0:08.10');
    expect(fireEvent.wheel(surface(), { deltaY: -100, ctrlKey: true, clientX: 0 })).toBe(false);
    // the time at the left edge stays at the left edge
    expect(label()).toBe('0:05.00 to 0:07.00');
  });

  it('shift-wheel and sideways wheel pan a zoomed view, and a view that fits cannot pan', async () => {
    mount();
    await ready();
    const label = () => document.querySelector('[data-view-label]')?.textContent;
    fireEvent.wheel(surface(), { deltaX: 100 });
    expect(label()).toBe('0:05.00 to 0:08.10');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.wheel(surface(), { deltaY: 100, shiftKey: true });
    expect(label()).toBe('0:06.15 to 0:07.15');
    fireEvent.wheel(surface(), { deltaX: -100 });
    expect(label()).toBe('0:06.05 to 0:07.05');
  });

  it('a view slider pans by key and by drag, and is there only when zoomed', async () => {
    mount();
    await ready();
    expect(screen.queryByRole('slider', { name: 'Visible part' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    const pan = screen.getByRole('slider', { name: 'Visible part' });
    expect(pan.getAttribute('aria-valuetext')).toBe('Showing 0:06.05 to 0:07.05');
    expect(fireEvent.keyDown(pan, { key: 'ArrowRight' })).toBe(false);
    expect(document.querySelector('[data-view-label]')?.textContent).toBe('0:06.15 to 0:07.15');
    fireEvent.keyDown(pan, { key: 'ArrowLeft', shiftKey: true });
    expect(document.querySelector('[data-view-label]')?.textContent).toBe('0:05.15 to 0:06.15');
    const track = document.querySelector('[data-ribbon-pan]') as HTMLElement;
    drag(track, 0, 1000);
    expect(document.querySelector('[data-view-label]')?.textContent).toBe('0:07.10 to 0:08.10');
  });

  it('plus and minus on the view slider zoom', async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Visible part' }), { key: '+' });
    expect(document.querySelector('[data-view-label]')?.textContent).toBe('0:06.05 to 0:07.05');
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Visible part' }), { key: '-' });
    expect(document.querySelector('[data-view-label]')?.textContent).toBe('0:05.55 to 0:07.55');
  });

  it('follows the playhead out of a zoomed view, until the narrator pans away while it plays', async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    const label = () => document.querySelector('[data-view-label]')?.textContent;
    act(() => state.dispatch({ type: 'play', t: 6.2 }));
    expect(label()).toBe('0:06.05 to 0:07.05');
    act(() => state.dispatch({ type: 'play', t: 7.2 }));
    expect(label()).toBe('0:06.70 to 0:07.70');
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Visible part' }), { key: 'ArrowLeft', shiftKey: true });
    expect(label()).toBe('0:05.70 to 0:06.70');
    act(() => state.dispatch({ type: 'play', t: 7.3 }));
    expect(label()).toBe('0:05.70 to 0:06.70');
    act(() => state.dispatch({ type: 'play', t: null }));
    act(() => state.dispatch({ type: 'play', t: 7.3 }));
    expect(label()).toBe('0:06.80 to 0:07.80');
  });

  it('says what a bar is when the zoom is finer than the peaks, and not when it is not', async () => {
    mount();
    await ready();
    expect(document.querySelector('[data-peaks-detail]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(document.querySelector('[data-peaks-detail]')?.textContent).toBe('Each bar is 20 ms of audio at this zoom: the host keeps 50 peaks a second.');
  });

  it('keeps the range when the view moves, and the handles stay on their times', async () => {
    mount();
    await ready();
    select('p-1:2', 'p-1:3');
    await waitFor(() => expect(startHandle()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(now(startHandle())).toBeCloseTo(5.6, 6);
    expect(now(endHandle())).toBeCloseTo(6.2, 6);
  });
});

describe('states', () => {
  it('without audio there is no surface, no range and no zoom, and it says so', async () => {
    const api = { ...createMockApi(), workspacePeaks: async (chapterId: string) => ({ chapterId, items: [{ index: 0, reason: 'The source is not a WAV.' }] }) };
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Probe />
          <Ribbon chapterId="chapter-1" pid="p-1" clocks={sameClock([0])} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    act(() => state.dispatch({ type: 'place', key: 'p-1:0' }));
    await waitFor(() => expect(screen.getByText(/No audio to draw/)).toBeTruthy());
    expect(document.querySelector('[data-ribbon-surface]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull();
  });

  it('the range and view go with the paragraph: another paragraph starts whole and without a range', async () => {
    mount();
    await ready();
    drag(surface(), xAt(5.54), xAt(6.296));
    await waitFor(() => expect(state.state.span).toBeTruthy());
    act(() => state.dispatch({ type: 'place', key: 'p-0:0' }));
    await waitFor(() => expect(state.state.span ?? null).toBeNull());
    expect(within(document.body).queryByRole('slider', { name: 'Start of range' })).toBeNull();
  });

  it('a pointer that is cancelled mid-drag ends the drag with the range it had', async () => {
    mount();
    await ready();
    fireEvent.pointerDown(surface(), { clientX: xAt(5.54), button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface(), { clientX: xAt(6.296), pointerId: 1 });
    fireEvent.pointerCancel(surface(), { pointerId: 1 });
    await waitFor(() => expect(now(endHandle())).toBeCloseTo(6.296, 2));
    fireEvent.pointerMove(surface(), { clientX: xAt(7.5), pointerId: 1 });
    expect(now(endHandle())).toBeCloseTo(6.296, 2);
  });

  it('a double-fired pointer-up changes nothing the second time', async () => {
    mount();
    await ready();
    drag(surface(), xAt(5.54), xAt(6.296));
    fireEvent.pointerUp(surface(), { clientX: xAt(6.296), pointerId: 1 });
    await waitFor(() => expect(now(endHandle())).toBeCloseTo(6.296, 2));
    expect(state.state.span).toBeTruthy();
  });

  it('has the pointer cursors the controls promise', async () => {
    mount();
    await ready();
    select('p-1:2', 'p-1:3');
    await waitFor(() => expect(startHandle()).toBeTruthy());
    expect(startHandle().className).toContain('cursor-ew-resize');
    expect(endHandle().className).toContain('cursor-ew-resize');
    expect((document.querySelector('[data-range-body]') as HTMLElement).className).toContain('cursor-grab');
    expect(surface().className).toContain('cursor-crosshair');
  });
});
