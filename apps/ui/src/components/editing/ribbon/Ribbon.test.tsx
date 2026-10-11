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
import { Ribbon, RibbonView } from './Ribbon';
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
        {doc.paras.map((p) => (
          <Ribbon key={p.p.id} chapterId="chapter-1" pid={p.p.id} />
        ))}
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

describe('Ribbon placement', () => {
  it('ribbon-sits-under-the-active-line-only', async () => {
    const doc = marksDoc();
    page(doc, withPeaks(peaks(0, 20)), (d) => d({ type: 'place', key: 'p-2:1' }));
    expect(document.querySelectorAll('[data-ribbon-pid]')).toHaveLength(0);
    click();
    await waitFor(() => expect(document.querySelectorAll('[data-ribbon-pid]')).toHaveLength(1));
    expect(document.querySelector('[data-ribbon-pid]')?.getAttribute('data-ribbon-pid')).toBe('p-2');
  });

  it('prefers the cursor, then the selection head, then the playing word', async () => {
    const doc = marksDoc();
    page(doc, withPeaks(peaks(0, 20)), (d) => {
      d({ type: 'select', anchor: 'p-1:0', head: 'p-1:2' });
      d({ type: 'play', t: (doc.paras[1].start ?? 0) + 0.05 });
    });
    click();
    await waitFor(() => expect(document.querySelector('[data-ribbon-pid]')?.getAttribute('data-ribbon-pid')).toBe('p-1'));
  });
});

describe('RibbonView drawing', () => {
  const doc = marksDoc();
  const layout = (sel: string[] = [], t: number | null = null) => ribbonLayout(doc, 'p-1', sel, t)!;
  const l = layout();

  it('draws-the-lines-window-of-the-peaks, at the device pixel ratio, and redraws when the span changes', async () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const p = peaks(0, 20);
    const { rerender } = render(<RibbonView layout={l} peaks={p} />);
    await waitFor(() => expect(sizes.length).toBeGreaterThan(0));
    const last = sizes[sizes.length - 1];
    // sized in device pixels: twice the CSS height at a ratio of 2, and an even width
    expect(last.height).toBe(112);
    expect(last.width).toBeGreaterThan(0);
    expect(last.width % 2).toBe(0);
    const before = sizes.length;
    rerender(<RibbonView layout={{ ...l, t1: l.t1 + 0.5 }} peaks={p} />);
    await waitFor(() => expect(sizes.length).toBeGreaterThan(before));
    vi.unstubAllGlobals();
  });

  it('a span outside the entry draws nothing and says so', () => {
    render(<RibbonView layout={l} peaks={peaks(100, 5)} />);
    expect(sizes).toHaveLength(0);
    expect(screen.getByText(/No audio to draw/)).toBeTruthy();
  });

  it('ticks-at-every-word-boundary-and-a-tint-where-flagged, with a cue beyond colour', async () => {
    render(<RibbonView layout={l} peaks={peaks(0, 20)} />);
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
    render(<RibbonView layout={withBoth} peaks={peaks(0, 20)} />);
    await waitFor(() => expect(calls.some((c) => c.op === 'fillRect')).toBe(true));
    expect(document.body.textContent).toMatch(/Selection from/);
    expect(document.body.textContent).toMatch(/Playing at/);
  });

  it('cut-words-leave-a-gap-marker: a hatched gap', async () => {
    const cutDoc = marksDoc({ cuts: [{ id: 'c1', a: 4.2, b: 4.3, mode: 'gap', keys: ['p-2:1'], off0: 0, off1: 0.1 }] });
    const cl = ribbonLayout(cutDoc, 'p-2', [], null)!;
    render(<RibbonView layout={cl} peaks={peaks(0, 20)} />);
    await waitFor(() => expect(calls.some((c) => c.op === 'clip')).toBe(true));
    expect(document.body.textContent).toMatch(/1 cut span, drawn hatched/);
  });

  it('canvas-draws-from-the-tokens-in-both-themes: a token change redraws in the new colour', async () => {
    render(<RibbonView layout={l} peaks={peaks(0, 20)} />);
    await waitFor(() => expect(calls.some((c) => c.color === 'rgb(1, 2, 3)')).toBe(true));
    calls.length = 0;
    document.documentElement.style.setProperty('--waveform', 'rgb(9, 8, 7)');
    document.documentElement.setAttribute('data-theme', 'dark');
    await waitFor(() => expect(calls.some((c) => c.color === 'rgb(9, 8, 7)')).toBe(true));
    document.documentElement.removeAttribute('data-theme');
  });

  it('ribbon-is-labelled: a name and a text alternative with the duration and flagged count; axe is clean', async () => {
    const { container } = render(<RibbonView layout={l} peaks={peaks(0, 20)} />);
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
