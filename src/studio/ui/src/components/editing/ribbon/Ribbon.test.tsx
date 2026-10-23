// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import type { ChapterDoc } from '../model';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import { frameSubscribers } from './frameLoop';
import { sameClock, shiftPeaks } from './docClock';
import { RibbonView } from './Ribbon';
import { WaveDock } from './WaveDock';
import { ribbonLayout } from './ribbonLayout';

afterEach(cleanup);

/** A recording 2D context: every call is logged with the fill/stroke colour in force. */
interface Call {
  op: string;
  args: number[];
  color: string;
}
let calls: Call[];
let sizes: HTMLCanvasElement[];
beforeEach(() => {
  calls = [];
  sizes = [];
  document.documentElement.removeAttribute('style');
  document.documentElement.style.setProperty('--waveform', 'rgb(1, 2, 3)');
  // jsdom does not resolve custom properties in computed style; the tokens live on the root's inline style here.
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () => ({ color: 'rgb(0, 0, 0)', getPropertyValue: (n: string) => document.documentElement.style.getPropertyValue(n) }) as CSSStyleDeclaration,
  );
  const make = (): unknown => {
    const state = { fillStyle: '', strokeStyle: '' };
    return new Proxy(state, {
      get(t, k: string) {
        if (k in t) return (t as Record<string, unknown>)[k];
        return (...args: number[]) => {
          calls.push({ op: k, args, color: String(/fill/i.test(k) ? t.fillStyle : t.strokeStyle) });
        };
      },
      set(t, k: string, v) {
        (t as Record<string, unknown>)[k] = v;
        return true;
      },
    });
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    sizes.push(this);
    return make() as CanvasRenderingContext2D;
  });
});

const peaks = (start: number, seconds: number): WorkspacePeaks => {
  const n = Math.round(seconds * 10);
  const bytes = new Uint8Array(n * 2);
  for (let i = 0; i < n; i += 1) {
    bytes[2 * i] = 256 - 40;
    bytes[2 * i + 1] = 40;
  }
  return { startSeconds: start, bucketsPerSecond: 10, buckets: n, minMax: btoa(String.fromCharCode(...bytes)), sampleRate: 48000, channels: 1 };
};

/** The entry as the ribbon is given it: already on the document clock, which these fixtures share with the file. */
const onDoc = (p: WorkspacePeaks) => [shiftPeaks(p, 0)];

function Driver({ run }: { run: (d: ReturnType<typeof useEditingPage>['dispatch']) => void }) {
  const { dispatch } = useEditingPage();
  return (
    <button type="button" onClick={() => run(dispatch)}>
      go
    </button>
  );
}
function page(doc: ChapterDoc, api = createMockApi(), run?: (d: ReturnType<typeof useEditingPage>['dispatch']) => void) {
  return render(
    <ApiProvider api={api}>
      <EditingPageProvider doc={doc}>
        <WaveDock chapterId="chapter-1" clocks={sameClock([0])} take={null} />
        {run ? <Driver run={run} /> : null}
      </EditingPageProvider>
    </ApiProvider>,
  );
}
const withPeaks = (p: WorkspacePeaks | undefined, reason?: string) => ({
  ...createMockApi(),
  workspacePeaks: async (chapterId: string) => ({ chapterId, items: [{ index: 0, ...(p ? { peaks: p } : { reason }) }] }),
});
const click = () => act(() => screen.getByText('go').click());

describe('one waveform, docked', () => {
  const pidShown = () => document.querySelector('[data-ribbon-pid]')?.getAttribute('data-ribbon-pid');
  const viewLabel = () => document.querySelector('[data-view-label]')?.textContent;
  const fine = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

  it('waveform-is-docked-once: one waveform for the page, on the first line before anything is chosen, and none under the lines', async () => {
    const doc = marksDoc();
    page(doc, withPeaks(peaks(0, 20)), (d) => d({ type: 'place', key: 'p-2:1' }));
    await waitFor(() => expect(document.querySelector('[data-ribbon-surface]')).not.toBeNull());
    expect(document.querySelectorAll('[data-ribbon-pid]')).toHaveLength(1);
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(pidShown()).toBe('p-1');
    expect(viewLabel()).toBe(`${fine(doc.paras[0].start ?? 0)} to ${fine(ribbonLayout(doc, 'p-1', [], null)!.t1)}`);
  });

  it('follows the cursor line: its window comes into view', async () => {
    const doc = marksDoc();
    page(doc, withPeaks(peaks(0, 20)), (d) => d({ type: 'place', key: 'p-2:1' }));
    click();
    await waitFor(() => expect(pidShown()).toBe('p-2'));
    expect(viewLabel()).toBe(`${fine(doc.paras[1].start ?? 0)} to ${fine(ribbonLayout(doc, 'p-2', [], null)!.t1)}`);
  });

  it('follows the selection head when nothing is playing', async () => {
    const doc = marksDoc();
    page(doc, withPeaks(peaks(0, 20)), (d) => {
      d({ type: 'select', anchor: 'p-1:0', head: 'p-1:2' });
    });
    click();
    await waitFor(() => expect(pidShown()).toBe('p-1'));
  });

  it('follows the playing paragraph while the text advances, without waiting for playback to stop', async () => {
    const doc = marksDoc();
    page(doc, withPeaks(peaks(0, 20)), (d) => {
      d({ type: 'select', anchor: 'p-1:0', head: 'p-1:2' });
      d({ type: 'play', t: (doc.paras[1].start ?? 0) + 0.05 });
    });
    click();
    await waitFor(() => expect(pidShown()).toBe('p-2'));
  });

  it('keeps one height with audio, without audio and with a range, so nothing around it moves', async () => {
    const doc = marksDoc();
    page(doc, withPeaks(peaks(0, 20)));
    await waitFor(() => expect(document.querySelector('[data-ribbon-surface]')).not.toBeNull());
    const dock = () => document.querySelector('[data-wave-dock]') as HTMLElement;
    const height = dock().style.height;
    expect(height).toBe('140px');
    cleanup();
    page(doc, withPeaks(undefined, 'No waveform: the source is not a WAV.'));
    await waitFor(() => expect(screen.getByText(/No audio to draw/)).toBeTruthy());
    expect(dock().style.height).toBe(height);
  });
});

describe('RibbonView drawing', () => {
  const doc = marksDoc();
  const layout = (sel: string[] = [], t: number | null = null) => ribbonLayout(doc, 'p-1', sel, t)!;
  const l = layout();

  it('draws-the-lines-window-of-the-peaks, at the device pixel ratio, and redraws when the span changes', async () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const p = peaks(0, 20);
    const { rerender } = render(<RibbonView layout={l} peaks={onDoc(p)} />);
    await waitFor(() => expect(sizes.length).toBeGreaterThan(0));
    const last = sizes[sizes.length - 1];
    // sized in device pixels: twice the CSS height at a ratio of 2, and an even width
    expect(last.height).toBe(112);
    expect(last.width).toBeGreaterThan(0);
    expect(last.width % 2).toBe(0);
    const before = sizes.length;
    rerender(<RibbonView layout={{ ...l, t1: l.t1 + 0.5 }} peaks={onDoc(p)} />);
    await waitFor(() => expect(sizes.length).toBeGreaterThan(before));
    vi.unstubAllGlobals();
  });

  it('a span outside the entry draws nothing and says so', () => {
    render(<RibbonView layout={l} peaks={onDoc(peaks(100, 5))} />);
    expect(sizes).toHaveLength(0);
    expect(screen.getByText(/No audio to draw/)).toBeTruthy();
  });

  it('ticks-at-every-word-boundary-and-a-tint-where-flagged, with a cue beyond colour', async () => {
    render(<RibbonView layout={l} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const lines = calls.filter((c) => c.op === 'lineTo').length;
    expect(lines).toBeGreaterThanOrEqual(l.ticks.length);
    // a tint fill plus a 3px bar per flagged span
    expect(calls.filter((c) => c.op === 'fillRect' && c.args[3] === 3)).toHaveLength(l.flags.length);
    expect(screen.getByRole('img').getAttribute('aria-describedby')).toBeTruthy();
    expect(document.body.textContent).toMatch(/4 flagged words/);
  });

  it('selection-band-and-playhead are clipped to the line window', async () => {
    const mid = (l.t0 + l.t1) / 2;
    const withBoth = layout(['p-1:0', 'p-2:1'], mid);
    expect(withBoth.band!.t1).toBeLessThanOrEqual(l.t1);
    render(<RibbonView layout={withBoth} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(calls.some((c) => c.op === 'fillRect')).toBe(true));
    expect(document.body.textContent).toMatch(/Selection from/);
    expect(document.body.textContent).toMatch(/Playing at/);
  });

  it('cut-words-leave-a-gap-marker: a hatched gap', async () => {
    const cutDoc = marksDoc({ cuts: [{ id: 'c1', a: 4.2, b: 4.3, mode: 'gap', keys: ['p-2:1'], off0: 0, off1: 0.1 }] });
    const cl = ribbonLayout(cutDoc, 'p-2', [], null)!;
    render(<RibbonView layout={cl} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(calls.some((c) => c.op === 'clip')).toBe(true));
    expect(document.body.textContent).toMatch(/1 cut span, drawn hatched/);
  });

  it('canvas-draws-from-the-tokens-in-both-themes: a token change redraws in the new colour', async () => {
    render(<RibbonView layout={l} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(calls.some((c) => c.color === 'rgb(1, 2, 3)')).toBe(true));
    calls.length = 0;
    document.documentElement.style.setProperty('--waveform', 'rgb(9, 8, 7)');
    document.documentElement.setAttribute('data-theme', 'dark');
    await waitFor(() => expect(calls.some((c) => c.color === 'rgb(9, 8, 7)')).toBe(true));
    document.documentElement.removeAttribute('data-theme');
  });

  it('ribbon-is-labelled: a name and a text alternative with the duration and flagged count; axe is clean', async () => {
    const { container } = render(<RibbonView layout={l} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(sizes.length).toBeGreaterThan(0));
    expect(screen.getByRole('img', { name: 'Audio of the active line' })).toBeTruthy();
    expect(container.textContent).toMatch(/seconds long/);
    expect(container.textContent).toMatch(/flagged words/);
    const res = await axe.run(container);
    expect(res.violations).toEqual([]);
  });
});

describe('no-audio-state', () => {
  it('no peaks: no bars, the host reason, and the page is not blocked', async () => {
    const doc = marksDoc();
    page(doc, withPeaks(undefined, 'No waveform: the source is not a WAV.'), (d) => d({ type: 'place', key: 'p-1:1' }));
    click();
    await waitFor(() => expect(screen.getByText(/No audio to draw/)).toBeTruthy());
    expect(document.body.textContent).toMatch(/source is not a WAV/);
    expect(sizes).toHaveLength(0);
    expect(screen.getByText('go')).toBeTruthy();
  });

  it('a failing host (standalone) says there is no audio', async () => {
    const doc = marksDoc();
    const api = { ...createMockApi(), workspacePeaks: async () => Promise.reject(new Error('Standalone: no host.')) };
    page(doc, api, (d) => d({ type: 'place', key: 'p-1:1' }));
    click();
    await waitFor(() => expect(document.body.textContent).toMatch(/Standalone: no host/));
    expect(document.body.textContent).toMatch(/No audio to draw/);
  });
});

describe('the waveform header', () => {
  it('names the active take', async () => {
    const doc = marksDoc();
    render(
      <ApiProvider api={withPeaks(peaks(0, 20))}>
        <EditingPageProvider doc={doc}>
          <WaveDock chapterId="chapter-1" take="T-7" clocks={sameClock([0])} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    const head = await waitFor(() => {
      const el = document.querySelector('[data-ribbon-head]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(head.textContent).toBe('T-7active take');
  });
  it('says recording when the line has no take', async () => {
    const doc = marksDoc();
    render(
      <ApiProvider api={withPeaks(peaks(0, 20))}>
        <EditingPageProvider doc={doc}>
          <WaveDock chapterId="chapter-1" take={null} clocks={sameClock([0])} />
        </EditingPageProvider>
      </ApiProvider>,
    );
    const head = await waitFor(() => {
      const el = document.querySelector('[data-ribbon-head]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(head.textContent).toBe('Recording');
  });
});

describe('RibbonView animation', () => {
  const doc = marksDoc();
  const l = ribbonLayout(doc, 'p-1', [], null)!;
  const playingAt = (t: number | null) => ({ ...l, playhead: t });
  const mid = (l.t0 + l.t1) / 2;
  let frames: Map<number, FrameRequestCallback>;
  const step = (now: number) => {
    const due = [...frames.values()];
    frames.clear();
    act(() => due.forEach((cb) => cb(now)));
  };
  beforeEach(() => {
    frames = new Map();
    let n = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.set(++n, cb);
      return n;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.motion;
  });
  const bars = () => calls.filter((c) => c.op === 'roundRect');

  it('schedules no frames while nothing is playing, and stops when playback stops', async () => {
    const { rerender } = render(<RibbonView layout={l} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(bars().length).toBeGreaterThan(0));
    expect(frames.size).toBe(0);
    expect(frameSubscribers()).toBe(0);

    rerender(<RibbonView layout={playingAt(mid)} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(frameSubscribers()).toBe(1));
    expect(frames.size).toBe(1);

    rerender(<RibbonView layout={playingAt(null)} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(frameSubscribers()).toBe(0));
    expect(frames.size).toBe(0);
  });

  it('redraws only its own canvas on each frame, with the bars near the playhead taller than at rest', async () => {
    render(<RibbonView layout={playingAt(mid)} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(frameSubscribers()).toBe(1));
    const heightsOf = () => bars().map((c) => c.args[3]);
    calls.length = 0;
    step(1000 / 2.4 / 2);
    const grown = heightsOf();
    expect(grown.length).toBeGreaterThan(0);
    expect(Math.max(...grown)).toBeGreaterThan(Math.min(...grown));
    // a frame draws the bars once: no new canvas size, and one rAF is queued for the next
    expect(frames.size).toBe(1);
  });

  it('draws the still look and runs no loop when the narrator reduces motion', async () => {
    document.documentElement.dataset.motion = 'reduce';
    render(<RibbonView layout={playingAt(mid)} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(bars().length).toBeGreaterThan(0));
    expect(frameSubscribers()).toBe(0);
    expect(frames.size).toBe(0);
    const heights = new Set(bars().map((c) => c.args[3]));
    // a flat tone: every bar the same height, none grown
    expect(heights.size).toBe(1);
  });

  it('stops the loop and settles to the still look when motion is reduced mid-playback', async () => {
    render(<RibbonView layout={playingAt(mid)} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(frameSubscribers()).toBe(1));
    act(() => {
      document.documentElement.dataset.motion = 'reduce';
    });
    await waitFor(() => expect(frameSubscribers()).toBe(0));
    expect(frames.size).toBe(0);
  });

  it('data-motion="play" keeps the loop going even though the system asks for less', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }));
    document.documentElement.dataset.motion = 'play';
    render(<RibbonView layout={playingAt(mid)} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(frameSubscribers()).toBe(1));
  });

  it('unmounting leaves no frame scheduled', async () => {
    const { unmount } = render(<RibbonView layout={playingAt(mid)} peaks={onDoc(peaks(0, 20))} />);
    await waitFor(() => expect(frameSubscribers()).toBe(1));
    unmount();
    expect(frameSubscribers()).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('two ribbons playing together share one frame request', async () => {
    render(
      <>
        <RibbonView layout={playingAt(mid)} peaks={onDoc(peaks(0, 20))} />
        <RibbonView layout={playingAt(mid + 0.2)} peaks={onDoc(peaks(0, 20))} />
      </>,
    );
    await waitFor(() => expect(frameSubscribers()).toBe(2));
    expect(frames.size).toBe(1);
  });
});
