// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../primitives/Tooltip';
import { ChapterStrip, type StripChapter } from './ChapterStrip';
import { PeaksCanvas } from './PeaksCanvas';
import { ProofHeader } from './ProofHeader';
import { WaveformWindow, type WaveformWindowProps } from './WaveformWindow';
import type { Pin } from './pins';
import type { TimeWindow } from './windowMath';

afterEach(cleanup);

describe('ProofHeader', () => {
  it('shows the ring and both counters, the ring hidden from assistive tech', () => {
    const { container } = render(<ProofHeader progress={{ cleared: 3, total: 8, decided: 5, open: 5, percent: 38 }} chapterBar={<span>bar</span>} />);
    expect(container.textContent).toContain('3 of 8 cleared');
    expect(container.textContent).toContain('· 5 decided');
    const ring = container.querySelector('[data-ring]')!;
    expect(ring.getAttribute('data-ring')).toBe('38');
    expect(ring.getAttribute('aria-hidden')).toBe('true');
  });
  it('has no ring and no counters without notes', () => {
    const { container } = render(<ProofHeader progress={{ cleared: 0, total: 0, decided: 0, open: 0, percent: 0 }} chapterBar={null} />);
    expect(container.querySelector('[data-ring]')).toBeNull();
    expect(container.textContent).not.toContain('cleared');
  });
});

const chapters = (n: number): StripChapter[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `Chapter ${i}`,
    number: i === 0 || i === n - 1 ? null : i,
    total: i === 1 ? 0 : 4,
    open: i === 2 ? 0 : 3,
  }));

describe('ChapterStrip', () => {
  it('has a tile per chapter with its label, count and state', () => {
    const onChoose = vi.fn();
    render(<ChapterStrip chapters={chapters(5)} current="c3" onChooseChapter={onChoose} />);
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Chapter 0: 3 open of 4' }).textContent).toBe('Open3');
    expect(screen.getByRole('button', { name: 'Chapter 4: 3 open of 4' }).textContent).toBe('Close3');
    expect(screen.getByRole('button', { name: 'Chapter 1: no notes' }).textContent).toBe('1—');
    expect(screen.getByRole('button', { name: 'Chapter 2: 0 open of 4' }).getAttribute('data-state')).toBe('clear');
    expect(screen.getByRole('button', { name: 'Chapter 3: 3 open of 4' }).getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Chapter 2: 0 open of 4' }));
    expect(onChoose).toHaveBeenCalledWith('c2');
  });
  it('goes dense above the threshold: a dot per tile and every fifth number labelled', () => {
    render(<ChapterStrip chapters={chapters(24)} current="c1" onChooseChapter={() => {}} />);
    const labels = screen.getAllByRole('button').map((b) => b.querySelector('span')!.textContent);
    expect(labels[5]).toBe('5');
    expect(labels[6]).toBe('');
    expect(labels[0]).toBe('In');
    expect(labels[23]).toBe('Out');
    expect(screen.getByRole('button', { name: 'Chapter 6: 3 open of 4' }).querySelector('b')!.textContent).toBe('●');
    expect(screen.getByRole('group').getAttribute('data-dense')).toBe('true');
  });
});

const pin = (id: string, sec: number, done = false): Pin => ({ id, sec, colour: 'red', done, label: `Note ${id}` });

function Harness({
  initial = { start: 0, len: 60 },
  pins = [pin('a', 20), pin('b', 400)],
  total = 760,
  onPin,
  initialSel = null,
  ...rest
}: { initial?: TimeWindow; initialSel?: string | null; onPin?: (id: string) => void } & Partial<WaveformWindowProps>) {
  const [win, setWin] = useState(initial);
  const [sel, setSel] = useState<string | null>(initialSel);
  return (
    <TooltipProvider>
      <div onKeyDown={() => (document.body.dataset.leaked = 'yes')}>
        <WaveformWindow
          total={total}
          window={win}
          onWindowChange={setWin}
          segments={[]}
          pins={pins}
          selectedId={sel}
          onPin={(id) => {
            onPin?.(id);
            setSel(id);
          }}
          noteCount={pins.length}
          {...rest}
        />
      </div>
    </TooltipProvider>
  );
}

const label = () => document.querySelector('[data-window-label]')!.textContent;

describe('WaveformWindow', () => {
  it('centres the window on a selected note outside it and leaves one inside', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Note a' }));
    expect(label()).toBe('00:00–01:00');
    cleanup();
    render(<Harness initialSel="b" />);
    expect(label()).toBe('06:10–07:10');
  });

  it('selects the earliest note in view when the window moves off the selection', () => {
    const onPin = vi.fn();
    render(<Harness initialSel="a" pins={[pin('a', 20), pin('b', 100), pin('c', 110)]} onPin={onPin} />);
    const slider = screen.getByRole('slider', { name: 'Window' });
    for (let i = 0; i < 12; i += 1) fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onPin).toHaveBeenCalledWith('b');
  });

  it('steps through the lengths, disables at the ends and clamps to a short chapter', () => {
    render(<Harness initial={{ start: 0, len: 30 }} total={90} />);
    const out = screen.getByRole('button', { name: 'Zoom out' });
    const zin = screen.getByRole('button', { name: 'Zoom in' });
    expect(zin.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(out);
    expect(label()).toBe('00:00–01:00');
    fireEvent.click(out);
    expect(label()).toBe('00:00–01:30');
    expect(out.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(zin);
    expect(label()).toBe('00:15–01:15');
  });

  it('drags the window keeping the grabbed spot, centres on an outside click, resizes by its handles and nudges by keys', () => {
    render(<Harness initial={{ start: 100, len: 100 }} pins={[]} />);
    const overview = document.querySelector('[data-overview]') as HTMLElement;
    overview.getBoundingClientRect = () => ({ left: 0, width: 760, top: 0, height: 34, right: 760, bottom: 34, x: 0, y: 0, toJSON: () => ({}) });
    // Grab 10 s left of the window's centre (at 140) and move to 240: the window follows by the same offset.
    fireEvent.pointerDown(overview, { clientX: 140, button: 0 });
    fireEvent.pointerMove(overview, { clientX: 240 });
    fireEvent.pointerUp(overview);
    expect(label()).toBe('03:20–05:00');
    fireEvent.pointerDown(overview, { clientX: 600, button: 0 });
    fireEvent.pointerUp(overview);
    expect(label()).toBe('09:10–10:50');

    const start = screen.getByRole('slider', { name: 'Window start' });
    const end = screen.getByRole('slider', { name: 'Window end' });
    fireEvent.keyDown(end, { key: 'ArrowRight' });
    expect(end.getAttribute('aria-valuenow')).toBe(String(650 + 5));
    for (let i = 0; i < 40; i += 1) fireEvent.keyDown(start, { key: 'ArrowRight', shiftKey: true });
    expect(Number(end.getAttribute('aria-valuenow')) - Number(start.getAttribute('aria-valuenow'))).toBe(30);
    const before = label();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Window' }), { key: 'ArrowLeft' });
    expect(label()).not.toBe(before);
    expect(document.body.dataset.leaked).toBeUndefined();
  });

  it('merges pins that would touch into a counted button unless one is selected, and draws a decided pin hollow', () => {
    const pins = [pin('a', 10), pin('b', 10.5, true), pin('c', 50)];
    render(<Harness initial={{ start: 0, len: 60 }} pins={pins} />);
    expect(screen.getByRole('button', { name: '2 notes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Note c' })).toBeTruthy();
    cleanup();
    render(<Harness initial={{ start: 0, len: 60 }} pins={pins} initialSel="a" />);
    expect(screen.queryByRole('button', { name: '2 notes' })).toBeNull();
    const decided = screen.getByRole('button', { name: 'Note b' });
    expect(decided.getAttribute('data-hollow')).toBe('true');
    expect(screen.getByRole('button', { name: 'Note a' }).getAttribute('data-hollow')).toBeNull();
  });

  it('takes pins, bands and the playhead as props and names the waveform', () => {
    const onPin = vi.fn();
    render(
      <Harness
        initial={{ start: 120, len: 120 }}
        pins={[pin('a', 130)]}
        onPin={onPin}
        bands={[{ id: 't', start: 130, end: 150, label: 'Take 2' }]}
        playhead={135}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Note a' }));
    expect(onPin).toHaveBeenCalledWith('a');
    expect(screen.getByText('Take 2')).toBeTruthy();
    expect(document.querySelector('[data-playhead]')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Chapter waveform, 02:00 to 04:00, 1 note in this chapter' })).toBeTruthy();
  });
});

describe('PeaksCanvas', () => {
  it('is decorative and draws without peaks', () => {
    const { container } = render(<PeaksCanvas segments={[{ itemGuid: 'a', start: 0, end: 10 }]} from={0} to={10} height={40} />);
    expect(container.firstElementChild!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('canvas')).toBeTruthy();
  });
});
