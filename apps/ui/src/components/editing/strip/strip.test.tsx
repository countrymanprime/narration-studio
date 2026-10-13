// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { WorkspacePeaks } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import type { LinePassage, LineTake } from '../takes/types';
import { StripToggle, TimelineStrip } from './TimelineStrip';
import { stripLayout, wordAtTime } from './stripLayout';
import { useStripOpen } from './useStripOpen';

afterEach(cleanup);
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

const doc = marksDoc();
const para = doc.paras.find((p) => p.p.id === 'p-1')!;
const take = (id: string, label: string, active = false, length = 4): LineTake => ({
  id,
  label,
  active,
  usable: true,
  sourceFile: `${id}.wav`,
  sourceStart: 2,
  sourceLength: length,
});
const passage = (...takes: LineTake[]): LinePassage => ({ id: 'ps-1', chapterId: '5', firstToken: 0, lastToken: 5, script: 'Alice', takes });
const three = passage(take('t-1', 'A'), take('t-2', 'B', true), take('t-3', 'C'));

function peaksOf(): WorkspacePeaks {
  const n = 2000;
  const bytes = new Uint8Array(n * 2);
  for (let i = 0; i < n; i += 1) {
    bytes[2 * i] = 256 - 40;
    bytes[2 * i + 1] = 40;
  }
  return { startSeconds: 0, bucketsPerSecond: 50, buckets: n, minMax: btoa(String.fromCharCode(...bytes)), sampleRate: 48000, channels: 1 };
}

type Place = { key?: string; select?: [string, string]; playT?: number };
function Seed({ place }: { place: Place }) {
  const { dispatch } = useEditingPage();
  useEffect(() => {
    if (place.key) dispatch({ type: 'place', key: place.key });
    if (place.select) dispatch({ type: 'select', anchor: place.select[0], head: place.select[1] });
    if (place.playT != null) dispatch({ type: 'play', t: place.playT });
  }, [place, dispatch]);
  return null;
}

function mount(p: LinePassage | null, place: Place = { key: 'p-1:1' }, extra: Partial<React.ComponentProps<typeof TimelineStrip>> = {}, withPeaks = true) {
  const api = {
    ...createMockApi(),
    workspacePeaks: async (chapterId: string) => ({ chapterId, items: withPeaks ? [{ index: 0, peaks: peaksOf() }] : [{ index: 0, reason: 'No waveform.' }] }),
  };
  const onPlay = vi.fn();
  const view = render(
    <ApiProvider api={api}>
      <EditingPageProvider doc={doc}>
        <Seed place={place} />
        <TimelineStrip passage={p} playingId={null} onPlay={onPlay} chapterId="5" {...extra} />
      </EditingPageProvider>
    </ApiProvider>,
  );
  return { ...view, onPlay };
}

describe('offered at 1360 and wider, off to begin with', () => {
  // The width gate is the page's (EditingPage.test.tsx "measures the window, not the page beside the rail").
  it('the toggle shows and hides the strip, and it starts off', () => {
    function Page() {
      const { open, toggle } = useStripOpen();
      return (
        <div>
          <StripToggle open={open} onToggle={toggle} />
          {open ? <section id="timeline" /> : null}
        </div>
      );
    }
    const { container } = render(<Page />);
    const btn = container.querySelector('#striptoggle') as HTMLElement;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('#timeline')).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('#timeline')).not.toBeNull();
    fireEvent.click(btn);
    expect(container.querySelector('#timeline')).toBeNull();
  });
});

describe('the strip follows the line', () => {
  it('shows the audio and one lane per shown take on one axis, none for a hidden take', async () => {
    mount(three, { key: 'p-1:1' }, { hidden: new Set(['t-1']) });
    await waitFor(() => expect(document.querySelector('[data-ribbon-pid="p-1"]')).not.toBeNull());
    expect([...document.querySelectorAll('#timeline [data-lane]')].map((l) => l.getAttribute('data-lane'))).toEqual(['audio', 't-2', 't-3']);
    expect(screen.queryByRole('button', { name: 'Play take A' })).toBeNull();
  });
  it('redraws for another line', async () => {
    mount(three, { key: 'p-2:1' });
    await waitFor(() => expect(document.querySelector('[data-ribbon-pid="p-2"]')).not.toBeNull());
  });
  it('a line with no takes shows the audio lane only; with no peaks it says so', async () => {
    mount(null, undefined, {}, false);
    expect(document.querySelectorAll('#timeline [data-lane]:not([data-lane="audio"])')).toHaveLength(0);
    await waitFor(() => expect(screen.getByText(/No audio to draw/)).toBeTruthy());
  });
});

describe('the selection and the playhead', () => {
  it('mirrors the selection as a band on the active lane with its length', () => {
    mount(three, { select: ['p-1:1', 'p-1:3'] });
    expect(document.querySelectorAll('#timeline [data-selband]')).toHaveLength(1);
    expect(document.querySelector('[data-lane="t-2"] [data-selband]')).not.toBeNull();
    expect(document.getElementById('timeline')!.textContent).toMatch(/\d+\.\d s/);
  });
  it('draws the playing time on every lane', () => {
    mount(three, { key: 'p-1:1', playT: (para.start as number) + 1 });
    expect(document.querySelectorAll('#timeline [data-lane] [data-now]')).toHaveLength(3);
  });
});

describe('dragging on the audio', () => {
  const rect = { left: 0, right: 1000, top: 0, bottom: 40, width: 1000, height: 40, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  it('finds the word under a time, and nothing in the margin or past the last word', () => {
    const items = para.items.filter((i) => i.t0 != null && !i.cut && i.st !== 'miss');
    const first = items[0];
    const last = items[items.length - 1];
    expect(wordAtTime(doc, 'p-1', (first.t0 as number) - 0.5)).toBeNull();
    expect(wordAtTime(doc, 'p-1', (first.t0 as number) + 0.05)).toBe(first.key);
    expect(wordAtTime(doc, 'p-1', (last.t1 as number) + 0.5)).toBeNull();
  });
  it('selects the whole words between the two times through the page state', () => {
    const items = para.items.filter((i) => i.t0 != null && !i.cut && i.st !== 'miss');
    const layout = stripLayout(doc, 'p-1', [], {}, [], null)!;
    const x = (t: number): number => ((t - layout.t0) / (layout.t1 - layout.t0)) * 1000;
    const seen: string[] = [];
    function Probe() {
      const { state } = useEditingPage();
      seen.push(state.sel ? `${state.sel.anchor}>${state.sel.head}` : 'none');
      return null;
    }
    const api = createMockApi();
    render(
      <ApiProvider api={api}>
        <EditingPageProvider doc={doc}>
          <Seed place={{ key: items[0].key }} />
          <Probe />
          <TimelineStrip passage={null} playingId={null} onPlay={() => undefined} chapterId="5" />
        </EditingPageProvider>
      </ApiProvider>,
    );
    const audio = document.querySelector('[data-tl-audio]') as HTMLElement;
    audio.getBoundingClientRect = () => rect;
    act(() => {
      fireEvent.pointerDown(audio, { clientX: x((items[0].t0 as number) + 0.05), buttons: 1 });
      fireEvent.pointerMove(audio, { clientX: x((items[3].t0 as number) + 0.05), buttons: 1 });
      fireEvent.pointerUp(audio);
    });
    expect(seen.at(-1)).toBe(`${items[0].key}>${items[3].key}`);
  });
});

describe('a lane plays its take', () => {
  it('is a button named for the take that calls onPlay with it', () => {
    const { onPlay } = mount(three);
    const lane = screen.getByRole('button', { name: 'Play take B' });
    lane.focus();
    expect(document.activeElement).toBe(lane);
    fireEvent.click(lane);
    expect(onPlay).toHaveBeenCalledWith(three.takes[1]);
  });
  it('says Stop on the take that plays', () => {
    mount(three, undefined, { playingId: 't-2' });
    expect(screen.getByRole('button', { name: 'Stop take B' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('stacked takes', () => {
  it('start at the same time on the shared axis', () => {
    const l = stripLayout(doc, 'p-1', three.takes, {}, [], null)!;
    expect(new Set(l.lanes.map((x) => x.start)).size).toBe(1);
    const apart = stripLayout(doc, 'p-1', three.takes, { 't-3': 30 }, [], null)!;
    expect(apart.t1).toBeGreaterThan(30);
  });
  it('a line with no audio span has no layout', () => {
    expect(stripLayout(doc, 'nope', [], {}, [], null)).toBeNull();
  });
});

describe('labelled and accessible', () => {
  it('is a named region and axe finds nothing', async () => {
    mount(three, { select: ['p-1:1', 'p-1:3'] });
    expect(screen.getByRole('region', { name: /Waveform and takes/ })).toBeTruthy();
    const out = await axe.run(document.body, { rules: { region: { enabled: false } } });
    expect(out.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('no selection, no band', () => {
  it('the cursor alone draws no band and no length', () => {
    mount(three, { key: 'p-1:1' });
    expect(document.querySelectorAll('#timeline [data-selband]')).toHaveLength(0);
  });
});
