// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import type { LinePassage, LineTake } from '../takes/types';
import { StripToggle, TimelineStrip } from './TimelineStrip';
import { stripLayout } from './stripLayout';
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

function mount(p: LinePassage | null, place: Place = { key: 'p-1:1' }, extra: Partial<React.ComponentProps<typeof TimelineStrip>> = {}) {
  const api = createMockApi();
  const onPlay = vi.fn();
  const view = render(
    <ApiProvider api={api}>
      <EditingPageProvider doc={doc}>
        <Seed place={place} />
        <TimelineStrip passage={p} playingId={null} onPlay={onPlay} {...extra} />
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
  const clock = (t: number): string => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  it('shows one lane per shown take on one axis, none for a hidden take, and no waveform of its own', () => {
    mount(three, { key: 'p-1:1' }, { hidden: new Set(['t-1']) });
    expect([...document.querySelectorAll('#timeline [data-lane]')].map((l) => l.getAttribute('data-lane'))).toEqual(['t-2', 't-3']);
    expect(screen.queryByRole('button', { name: 'Play take A' })).toBeNull();
    // The line's audio is the page's one waveform, docked above the transport (#2251, item 29).
    expect(document.querySelector('#timeline canvas')).toBeNull();
  });
  // Alignment audit XED-8: side by side in a 96 px column, "Retake on lane 2" ran under its lane and over its badge.
  it('stacks each take name over its badge in one fixed column, the name cut with its full text as a hint', () => {
    mount(three, { key: 'p-1:1' });
    const labels = [...document.querySelectorAll<HTMLElement>('#timeline [data-lane-label]')];
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.className).toContain('flex-col');
      expect(label.className).toContain('w-[7.5rem]');
      const name = label.firstElementChild as HTMLElement;
      expect(name.className).toContain('truncate');
      expect(name.title).toBe(name.textContent);
    }
  });
  it('redraws for another line', () => {
    mount(three, { key: 'p-2:1' });
    const l = stripLayout(doc, 'p-2', three.takes, {}, [], null)!;
    expect(document.getElementById('timeline')!.textContent).toContain(`${clock(l.t0)} to ${clock(l.t1)}`);
  });
  it('a line with no takes shows no lanes', () => {
    mount(null);
    expect(document.querySelectorAll('#timeline [data-lane]')).toHaveLength(0);
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
