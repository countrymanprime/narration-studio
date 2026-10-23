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
import { WPH } from '../../schedule/estimates';
import { deliveryCounts, NOT_MEASURED, stageSegments } from './overviewFigures';

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

  it('lets every tile button fill its whole cell, so the hover highlight covers the card and not a patch of it', () => {
    row();
    for (const name of [/Finished audio/, /Recording/, /Editing \+ proof/, /Open pickups/]) {
      const button = screen.getByRole('button', { name });
      // The hint wrapper sits between the cell and the button: it has to fill the cell too, or the button's `size-full` has nothing to fill.
      expect(button.parentElement!.className).toContain('size-full');
      expect(button.className).toContain('size-full');
    }
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

  it('due-tile with no due date reads Not set, says where to set one and goes to the schedule', async () => {
    const { onGo } = row({}, {}, MID_BOOK, null);
    const tile = screen.getByRole('button', { name: /Due/ });
    expect(tile.textContent).toBe('DueNot setSet it on the Schedule');
    await userEvent.click(tile);
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

  it("the book's pass and fail count comes from the chapters' QC verdicts", () => {
    const master = {
      c1: { mastered: true, qc: 'PASS' },
      c2: { mastered: true, qc: 'PASS' },
      c3: { mastered: true, qc: 'FAIL' },
      c4: { mastered: false, qc: null },
    };
    const delivery = deliveryCounts(['c1', 'c2', 'c3', 'c4', 'c5'], master);
    expect(delivery).toEqual({ ok: true, value: { pass: 2, fail: 1, total: 5 } });
    expect(deliveryCounts(['c1', 'c2'], master)).toEqual({ ok: true, value: { pass: 2, fail: 0, total: 2 } });
    // A review of a chapter that is not narrated is not counted; a book with no review is not measured.
    expect(deliveryCounts(['c5'], master).ok).toBe(false);
    expect(deliveryCounts(['c1'], undefined).ok).toBe(false);
    view(<KpiRow {...overviewFor(MID_BOOK).kpi} delivery={delivery} onGo={vi.fn()} />);
    const tile = screen.getByRole('button', { name: /Delivery check/ }).textContent;
    expect(tile).toContain('2');
    expect(tile).toContain('/ 5');
    expect(tile).toContain('1 fail · 2 unchecked');
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
    expect([...bar.querySelectorAll('i')].map((i) => i.title.split(':')[0])).toEqual(['Delivered', 'Proofed', 'Edited', 'Recorded', 'Not recorded yet']);
    // Chapter 1 is mastered, chapter 2 is in proof (edited), chapter 3 in edit (recorded), chapter 4 half recorded, chapter 5 untouched; a chapter is an hour.
    expect(bar.querySelector('i[title="Delivered: 1:00"]')).toBeTruthy();
    expect(bar.querySelector('i[title="Proofed: 0:00"]')).toBeTruthy();
    expect(bar.querySelector('i[title="Edited: 1:00"]')).toBeTruthy();
    expect(bar.querySelector('i[title="Recorded: 1:30"]')).toBeTruthy();
    expect(bar.querySelector('i[title="Not recorded yet: 1:30"]')).toBeTruthy();
  });

  it('says Recorded for the share recorded and has no footnote under the legend', () => {
    const { segments } = overviewFor(MID_BOOK);
    view(<StageBar segments={segments} wph={9300} />);
    expect(screen.getByText(/^Recorded/)).toBeTruthy();
    expect(screen.queryByText(/Recorded, not edited yet/)).toBeNull();
    expect(screen.queryByText(/Estimated from each chapter's words and status/)).toBeNull();
  });

  it('draws an empty bar for a book with no words', () => {
    view(<StageBar segments={overviewFor([]).segments} wph={9300} />);
    expect(screen.getByRole('img', { name: 'Book progress by stage' }).querySelectorAll('i')).toHaveLength(5);
  });
});

describe('stageSegments', () => {
  const hoursOf = (segments: ReturnType<typeof stageSegments>) => Object.fromEntries(segments.map((s) => [s.key, s.hours]));

  it('weights a chapter still in recording by the share of its audio measured, so the bar agrees with the Finished audio tile', () => {
    const half = MID_BOOK.filter((c) => c.id === 'c4');
    expect(hoursOf(stageSegments(half, WPH, {}))).toMatchObject({ recorded: 0.5, unrecorded: 0.5 });
  });

  it('counts a mastered chapter as delivered, and never lets a later stage count for less than an earlier one', () => {
    const [c1] = MID_BOOK;
    const delivered = { [c1.id]: { mastered: true } };
    expect(hoursOf(stageSegments([{ ...c1, status: 'recording', recordedSeconds: null }], WPH, delivered))).toMatchObject({
      delivered: 1,
      proofed: 0,
      edited: 0,
      recorded: 0,
      unrecorded: 0,
    });
    expect(hoursOf(stageSegments([{ ...c1, status: 'finalized' }], WPH, {}))).toMatchObject({ delivered: 0, proofed: 1 });
  });

  it('leaves a reference chapter out of the book', () => {
    const [c1] = MID_BOOK;
    expect(stageSegments([{ ...c1, contentKind: 'reference' }], WPH, {}).every((s) => s.words === 0 && s.percent === 0)).toBe(true);
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
  const chart = (chapters = MID_BOOK, log = undefined as Parameters<typeof overviewFor>[2], clearTodayLabel = false) => {
    const o = overviewFor(chapters, undefined, log);
    return view(
      <ProgressChart
        k={o.k}
        wph={9300}
        start={o.start}
        today={STORY_TODAY}
        due={o.kpi.due}
        recordedHours={o.recordedHours}
        series={o.series}
        clearTodayLabel={clearTodayLabel}
      />,
    );
  };

  it('chart-plan-actual-projection', () => {
    const { container } = chart();
    for (const line of ['plan', 'actual', 'projection', 'due']) expect(container.querySelector(`[data-line="${line}"]`), line).toBeTruthy();
    expect(container.querySelector('[data-marker="today"]')).toBeTruthy();
    expect(screen.getByText(/^done .* \(est\.\)$/)).toBeTruthy();
    const svg = screen.getByRole('img', { name: 'Recorded audio versus plan' });
    expect(document.getElementById(svg.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(/starts .*due .*Today is .*Estimated finish/);
  });

  it('chart-today-label-clears-the-estimate-line: never centred over the dot, where the projection runs up and right from it', () => {
    const { container } = chart(MID_BOOK, undefined, true);
    const dot = container.querySelector('[data-marker="today"]') as SVGCircleElement;
    const label = screen.getByText('today');
    const [x, y, cx, cy] = [label.getAttribute('x'), label.getAttribute('y'), dot.getAttribute('cx'), dot.getAttribute('cy')].map(Number);
    // Left of the dot and above it (recording ahead of the plan), or right of it and below (behind it, or no room on the left).
    if (label.getAttribute('text-anchor') === 'end') expect([x < cx, y < cy]).toEqual([true, true]);
    else expect([label.getAttribute('text-anchor'), x > cx, y > cy]).toEqual(['start', true, true]);
  });

  it('chart-today-label-leaves-the-dot-when-the-due-line-is-close: a due date a day away puts the label left of the dot', () => {
    const o = overviewFor(MID_BOOK, undefined, undefined);
    const dayAfter = new Date(STORY_TODAY.getTime() + 24 * 3600 * 1000);
    view(
      <ProgressChart
        k={o.k}
        wph={9300}
        start={new Date(STORY_TODAY.getTime() - 20 * 24 * 3600 * 1000)}
        today={STORY_TODAY}
        due={dayAfter}
        recordedHours={0.1}
        series={o.series}
        clearTodayLabel
      />,
    );
    expect(screen.getByText('today').getAttribute('text-anchor')).toBe('end');
  });

  it('chart keeps the label centred above the dot unless asked, as Production draws it', () => {
    chart();
    expect(screen.getByText('today').getAttribute('text-anchor')).toBe('middle');
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
