// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WaveformStrip } from './WaveformStrip';
import source from './WaveformStrip.tsx?raw';
import type { PlaylistSegment } from './playlist';
import type { WorkspacePeaksResult, WorkspaceToken } from '../../api/contracts/workspace';
import type { Flag } from './flags';

const playlist: PlaylistSegment[] = [
  { itemGuid: 'g1', sourceFile: 'a.wav', sourceStart: 0, sourceEnd: 10, elapsedStart: 0, elapsedEnd: 10, overlapsPrevious: false },
];

const peaks: WorkspacePeaksResult = {
  chapterId: 'c-0001',
  items: [{ index: 0, peaks: { startSeconds: 0, bucketsPerSecond: 50, buckets: 500, minMax: 'AAA=', sampleRate: 48000, channels: 1 } }],
};

describe('WaveformStrip', () => {
  afterEach(cleanup);

  it('renders a labelled region without throwing, even with no ResizeObserver (jsdom)', () => {
    render(
      <WaveformStrip
        playlist={playlist}
        alignmentItems={[{ index: 0, itemGuid: 'g1', live: true }]}
        peaks={peaks}
        tokens={[]}
        flags={[]}
        elapsed={3}
        duration={10}
      />,
    );
    expect(screen.getByRole('region', { name: "The chapter's waveform" })).toBeTruthy();
  });

  it('renders with no peaks loaded yet and no live items', () => {
    render(<WaveformStrip playlist={[]} alignmentItems={[]} peaks={undefined} tokens={[]} flags={[]} elapsed={0} duration={0} />);
    expect(screen.getByRole('region', { name: "The chapter's waveform" })).toBeTruthy();
  });

  it('activating a flag marker calls onSelectFlag with its index into the flags array', async () => {
    const user = userEvent.setup();
    const tokens: WorkspaceToken[] = [{ i: 0, w: 0, text: 'x', status: 'misread', item: 0, start: 2, end: 2.5 }];
    const flags: Flag[] = [{ id: 'f1', kind: 'misread', label: 'Misread word', tokenStart: 0, tokenEnd: 0, seekTokenIndex: 0 }];
    const onSelectFlag = vi.fn();
    render(
      <WaveformStrip
        playlist={playlist}
        alignmentItems={[{ index: 0, itemGuid: 'g1', live: true }]}
        peaks={peaks}
        tokens={tokens}
        flags={flags}
        elapsed={0}
        duration={10}
        onSelectFlag={onSelectFlag}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Misread word/ }));
    expect(onSelectFlag).toHaveBeenCalledWith(0);
  });
});

describe('WaveformStrip canvas colours', () => {
  // The backdrop draws only once a ResizeObserver reports a width, so stub one that reports 100px at once.
  let tokens: Record<string, string>;
  let strokes: string[];

  beforeEach(() => {
    tokens = { '--accent': 'rgb(1, 2, 3)', '--waveform': 'rgb(4, 5, 6)' };
    strokes = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly cb: ResizeObserverCallback) {}
        observe() {
          this.cb([{ contentRect: { width: 100 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        disconnect() {}
        unobserve() {}
      },
    );
    const ctx = {
      setTransform: () => {},
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      set strokeStyle(value: string) {
        strokes.push(value);
      },
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ getPropertyValue: (name: string) => tokens[name] ?? '', color: 'rgb(9, 9, 9)' }) as unknown as CSSStyleDeclaration,
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-theme');
  });

  function renderStrip(bare: boolean, elapsed = 5) {
    return render(
      <WaveformStrip
        playlist={playlist}
        alignmentItems={[{ index: 0, itemGuid: 'g1', live: true }]}
        peaks={peaks}
        tokens={[]}
        flags={[]}
        elapsed={elapsed}
        duration={10}
        bare={bare}
      />,
    );
  }

  it.each([false, true])('strokes-read-the-tokens-not-hex (bare=%s)', (bare) => {
    renderStrip(bare);
    expect(new Set(strokes)).toEqual(new Set(['rgb(1, 2, 3)', 'rgb(4, 5, 6)']));
    expect(strokes[0]).toBe('rgb(1, 2, 3)');
    expect(strokes).toContain('rgb(4, 5, 6)');
  });

  it('no-hex-literal-in-the-draw-path', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('missing-token-draws-nothing-wrong: an empty token falls back to the canvas colour', () => {
    tokens = {};
    renderStrip(true);
    expect(new Set(strokes)).toEqual(new Set(['rgb(9, 9, 9)']));
  });

  it('redraws-when-the-theme-changes without a playhead change', async () => {
    renderStrip(true);
    expect(strokes).toContain('rgb(4, 5, 6)');
    strokes.length = 0;
    tokens = { '--accent': 'rgb(10, 20, 30)', '--waveform': 'rgb(40, 50, 60)' };
    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    expect(new Set(strokes)).toEqual(new Set(['rgb(10, 20, 30)', 'rgb(40, 50, 60)']));
  });
});
