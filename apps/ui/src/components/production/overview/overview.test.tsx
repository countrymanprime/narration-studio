// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../primitives/Tooltip';
import { CheckCountsCard } from './CheckCountsCard';
import { KpiRow } from './KpiRow';
import { ProgressChart } from './ProgressChart';
import { StageBar } from './StageBar';
import { WeekCard } from './WeekCard';
import { COUNTS, FINISHED, MID_BOOK, NO_TAKE_LOG, NOTHING_RECORDED, STORY_TODAY, nameOf, overviewFor } from './overviewFixtures';
import { NOT_MEASURED } from './overviewFigures';

afterEach(cleanup);
const view = (ui: ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe('KpiRow', () => {
  const row = (
    overrides: Partial<ReturnType<typeof overviewFor>['kpi']> = {},
    extra: Partial<Parameters<typeof KpiRow>[0]> = {},
    chapters = MID_BOOK,
    due: Date | null = undefined as never,
  ) => {
    const o = due === (undefined as never) ? overviewFor(chapters) : overviewFor(chapters, due);
    const onGo = vi.fn();
    view(<KpiRow {...o.kpi} {...overrides} onGo={onGo} {...extra} />);
    return { onGo, o };
  };

  it('kpi-tiles-read-from-the-plan-and-the-overview', () => {
    row();
    const strip = screen.getByRole('list', { name: 'Production figures' });
    expect(strip).toBeTruthy();
    // 3600 + 3500 + 3700 + 1800 s recorded (3.5 h) over 5 chapters of one hour each at the standard rate.
    expect(screen.getByRole('button', { name: /Finished audio/ }).textContent).toContain('3:30');
    expect(screen.getByRole('button', { name: /Finished audio/ }).textContent).toContain('/ 5:00');
    expect(screen.getByRole('button', { name: /Recording/ }).textContent).toMatch(/of 15:00 est\./);
    expect(screen.getByRole('button', { name: /Editing \+ proof/ }).textContent).toMatch(/of 15:12 est\./);
  });

  it('names the ratio behind an estimate in the tooltip', async () => {
    row();
    await userEvent.hover(screen.getByRole('button', { name: /Recording/ }));
    expect(await screen.findByText('Estimated 3.0× the finished hours')).toBeTruthy();
  });

  it('due-tile-uses-the-deadline-tone', () => {
    row({}, {}, MID_BOOK, new Date(2026, 9, 3));
    expect(screen.getByRole('button', { name: /Due/ }).textContent).toMatch(/Oct 3.*2 days · ! (tight|behind)|✕ behind/);
    cleanup();
    row({}, {}, FINISHED);
    expect(screen.getByRole('button', { name: /Due/ }).textContent).toContain('✓ finished');
  });

  it('due-tile with no due date reads Set a due date and goes to the schedule', async () => {
    const { onGo } = row({}, {}, MID_BOOK, null);
    await userEvent.click(screen.getByRole('button', { name: /Set a due date/ }));
    expect(onGo).toHaveBeenCalledWith('schedule');
  });

  it('open-pickups-tile-says-minutes-or-the-reason', () => {
    row();
    expect(screen.getByRole('button', { name: /Open pickups/ }).textContent).toContain('about 12 min');
    cleanup();
    view(<KpiRow {...overviewFor(MID_BOOK, undefined, NO_TAKE_LOG).kpi} onGo={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Open pickups/ }).textContent).toContain('not measured yet');
  });

  it('delivery check reads Not measured yet where the host has no chapter-level source', () => {
    view(<KpiRow {...overviewFor(MID_BOOK, undefined, NO_TAKE_LOG).kpi} onGo={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Delivery check/ }).textContent).toContain(NOT_MEASURED);
  });

  it('tiles-navigate-by-callback', async () => {
    const { onGo } = row();
    const goes: Array<[RegExp, string]> = [
      [/Finished audio/, 'script'],
      [/Recording/, 'booth'],
      [/Editing \+ proof/, 'editing'],
      [/Open pickups/, 'pickups'],
      [/Delivery check/, 'master'],
      [/Due/, 'schedule'],
    ];
    for (const [name, target] of goes) {
      await userEvent.click(screen.getByRole('button', { name }));
      expect(onGo).toHaveBeenLastCalledWith(target);
    }
  });

  it('target-info-slot renders on the Recording tile and nothing when absent', () => {
    row({}, { targetInfo: <span data-testid="info">i</span> });
    expect(screen.getByTestId('info')).toBeTruthy();
    cleanup();
    row();
    expect(screen.queryByTestId('info')).toBeNull();
  });
});

describe('StageBar', () => {
  it('stage-bar-sums-to-the-book', () => {
    const { segments } = overviewFor(MID_BOOK);
    view(<StageBar segments={segments} wph={9300} />);
    const bar = screen.getByRole('img', { name: 'Book progress by stage' });
    const widths = [...bar.querySelectorAll('i')].map((i) => parseFloat(i.style.width));
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 1);
    expect(bar.querySelector('i[title^="Proofed"]')).toBeTruthy();
    expect(bar.querySelector('i[title^="Not recorded yet: 2:00"]')).toBeTruthy();
    // Delivered has no chapter-level source, so it is not drawn.
    expect(screen.queryByText(/Delivered/)).toBeNull();
  });

  it('draws an empty bar for a book with no words', () => {
    view(<StageBar segments={overviewFor([]).segments} wph={9300} />);
    expect(screen.getByRole('img', { name: 'Book progress by stage' }).querySelectorAll('i')).toHaveLength(4);
  });
});

describe('WeekCard', () => {
  it('this-week-sourced-or-reason: with a take log', () => {
    const { week } = overviewFor(MID_BOOK);
    view(<WeekCard figures={week} />);
    expect(screen.getByRole('progressbar', { name: 'Recorded this week' })).toBeTruthy();
    expect(screen.getByText(/recorded$/)).toBeTruthy();
  });

  it('this-week-sourced-or-reason: with none', () => {
    view(<WeekCard figures={overviewFor(MID_BOOK, undefined, NO_TAKE_LOG).week} />);
    expect(screen.getAllByText(NOT_MEASURED)).toHaveLength(2);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('ProgressChart', () => {
  const chart = (chapters = MID_BOOK, log = undefined as Parameters<typeof overviewFor>[2]) => {
    const o = overviewFor(chapters, undefined, log);
    return view(<ProgressChart k={o.k} wph={9300} start={o.start} today={STORY_TODAY} due={o.kpi.due} recordedHours={o.recordedHours} series={o.series} />);
  };

  it('chart-plan-actual-projection', () => {
    const { container } = chart();
    for (const line of ['plan', 'actual', 'projection', 'due']) expect(container.querySelector(`[data-line="${line}"]`), line).toBeTruthy();
    expect(container.querySelector('[data-marker="today"]')).toBeTruthy();
    expect(screen.getByText(/^done .* \(est\.\)$/)).toBeTruthy();
    const svg = screen.getByRole('img', { name: 'Recorded audio versus plan' });
    expect(document.getElementById(svg.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(/starts .*due .*Today is .*Estimated finish/);
  });

  it('chart without a take log has no actual line and says why', () => {
    const { container } = chart(MID_BOOK, NO_TAKE_LOG);
    expect(container.querySelector('[data-line="actual"]')).toBeNull();
    expect(screen.getByText('Recorded days not measured yet')).toBeTruthy();
  });

  it('chart-fills-its-box: follows the width a ResizeObserver reports', () => {
    const callbacks: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          callbacks.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    let clientWidth = 900;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => clientWidth);
    chart();
    const svg = screen.getByRole('img', { name: 'Recorded audio versus plan' });
    expect(svg.getAttribute('width')).toBe('900');
    expect(svg.getAttribute('height')).toBe('200');
    clientWidth = 700;
    act(() => callbacks.forEach((cb) => cb()));
    expect(svg.getAttribute('width')).toBe('700');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a book with nothing recorded still draws', () => {
    chart(NOTHING_RECORDED);
    expect(screen.getByRole('img', { name: 'Recorded audio versus plan' })).toBeTruthy();
  });
});

describe('CheckCountsCard', () => {
  it('check-counts-from-the-sync-state', async () => {
    const onCheck = vi.fn();
    view(<CheckCountsCard counts={COUNTS} nameOf={nameOf} onCheck={onCheck} />);
    expect(screen.getByRole('group', { name: /^Checked, as of last save: 2/ })).toBeTruthy();
    expect(screen.getByRole('group', { name: /^Out of date: 1\. Chapter 3/ })).toBeTruthy();
    expect(screen.getByRole('group', { name: /^Not checked yet: 2\. Chapter 4, Chapter 5/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Check recordings' }));
    expect(onCheck).toHaveBeenCalledWith(['c3', 'c4', 'c5']);
  });

  it('is disabled with a reason when the DAW is unreachable or nothing needs a check', async () => {
    const onCheck = vi.fn();
    view(<CheckCountsCard counts={COUNTS} nameOf={nameOf} unavailable="REAPER is not running." onCheck={onCheck} />);
    await userEvent.click(screen.getByRole('button', { name: 'Check recordings' }));
    expect(onCheck).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Check recordings' }).getAttribute('aria-disabled')).toBe('true');
    cleanup();
    view(<CheckCountsCard counts={{ current: ['c1'], stale: [], never: [] }} nameOf={nameOf} onCheck={onCheck} />);
    expect(screen.getByRole('button', { name: 'Check recordings' }).getAttribute('aria-disabled')).toBe('true');
  });
});
