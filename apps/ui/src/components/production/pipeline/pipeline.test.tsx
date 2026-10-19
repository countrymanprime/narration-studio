// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NarrationApi } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import { DawBanner } from './DawBanner';
import { NextUp } from './NextUp';
import { NoManuscript } from './NoManuscript';
import { PageHeader } from './PageHeader';
import { PipelineTable } from './PipelineTable';
import { buildPipelineRows } from './pipelineRows';
import { calcFor, MID_BOOK, MID_BOOK_RECOMMENDATIONS, MID_BOOK_SOURCES, NEXT_UP_BUSY, NEXT_UP_EMPTY, STORY_DUE, STORY_TODAY } from './pipelineFixtures';
import { useStageTimer } from './useStageTimer';

const opened = vi.hoisted(() => vi.fn());
vi.mock('../readiness/openReadiness', () => ({ openReadiness: opened }));

afterEach(() => {
  cleanup();
  opened.mockReset();
});

const view = (ui: ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);
const noop = () => undefined;

function table(overrides: Partial<Parameters<typeof PipelineTable>[0]> = {}) {
  const onGo = vi.fn();
  view(
    <PipelineTable
      rows={buildPipelineRows(MID_BOOK, MID_BOOK_SOURCES)}
      recommendations={MID_BOOK_RECOMMENDATIONS}
      onGo={onGo}
      notify={noop}
      onStatus={noop}
      {...overrides}
    />,
  );
  return { onGo };
}

describe('PipelineTable', () => {
  // The mock's `.cell` fills its column (`width: 100%`), where the badge shape is only a 52 px minimum.
  it('draws each stage cell across its column', () => {
    table();
    expect(document.querySelector('[data-cell]')!.className).toContain('w-full');
  });

  it('one-row-per-chapter-with-stage-cells: a row per chapter and the same width for every stage column', () => {
    table();
    const grid = screen.getByRole('table', { name: 'Chapter pipeline' });
    expect(within(grid).getAllByRole('row')).toHaveLength(MID_BOOK.length + 1);
    const widths = Array.from(grid.querySelectorAll('col')).map((col) => col.style.width);
    expect(widths.slice(2)).toEqual(Array(7).fill('5rem'));
    expect(widths[1]).toBe('4rem');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      expect.arrayContaining(['Chapter', 'Prep', 'Record', 'Edit', 'Proof', 'Pickups', 'Master', 'QC']),
    );
  });

  it('draws an under-way stage as a mark that needs no font, never the half-circle glyph', () => {
    table();
    const cell = screen.getByRole('button', { name: 'Chapter 3: Edit in progress' });
    expect(cell.textContent).toBe('');
    expect(cell.querySelector('[data-under-way]')).toBeTruthy();
  });

  it('readiness-chip-sits-on-the-current-stage-cell: on the stage the chapter is in and nowhere else, opening the panel', async () => {
    table();
    const chips = document.querySelectorAll('[data-rchip]');
    expect(Array.from(chips).map((chip) => chip.getAttribute('data-rchip'))).toEqual(['c3', 'c4']);
    expect(chips[0]!.closest('td')).toBe(within(screen.getByRole('button', { name: 'Chapter 3: Edit in progress' }).closest('tr')!).getAllByRole('cell')[4]);
    expect(chips[1]!.closest('td')).toBe(screen.getByRole('button', { name: /^Chapter 4: Record 50% recorded$/ }).closest('td'));
    await userEvent.click(chips[1] as HTMLElement);
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ chapterId: 'c4' }));
  });

  it('cells-go-to-their-stage-and-chapter: each cell is a button that reports its target and chapter', async () => {
    const { onGo } = table();
    await userEvent.click(screen.getByRole('button', { name: 'Chapter 3: Edit in progress' }));
    await userEvent.click(screen.getByRole('button', { name: 'Chapter 4: Record 50% recorded' }));
    await userEvent.click(screen.getByRole('button', { name: 'Chapter 2: Proof 66%, 6 of 9 notes cleared' }));
    expect(onGo.mock.calls).toEqual([
      ['editing', 'c3'],
      ['booth', 'c4'],
      ['proof', 'c2'],
    ]);
  });

  it('pickups-cell-waits-for-a-full-recording: the cell before the end is not a button', () => {
    table();
    expect(screen.queryByRole('button', { name: /^Chapter 4: Pickups/ })).toBeNull();
    expect(screen.getByRole('img', { name: 'Chapter 4: Pickups waiting for the recording' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chapter 2: Pickups 2 open' })).toBeTruthy();
  });

  it('scrolls inside its panel and is a tab stop', () => {
    table();
    const region = screen.getByRole('group', { name: 'Chapter pipeline scroll area' });
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain('overflow-x-auto');
  });
});

describe('NextUp', () => {
  const record = { ok: true, reason: '' };
  const timer = { running: false, onStart: vi.fn() };

  it('next-up-ranks-by-risk-then-group-then-stage: each item has its title, sub line and one action', () => {
    view(<NextUp inputs={NEXT_UP_BUSY} record={record} onGo={noop} timer={timer} />);
    const items = within(screen.getByRole('list', { name: 'Next up' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Finish recording Chapter 4'),
      expect.stringContaining('Pickup session · 4 lines'),
      expect.stringContaining('Chapter 2 fails 1 ACX check'),
    ]);
    expect(within(items[0]!).getByRole('button', { name: 'Open Booth' })).toBeTruthy();
    expect(within(items[1]!).getByRole('button', { name: 'Review pickups' })).toBeTruthy();
    expect(within(items[2]!).getByRole('button', { name: 'Inspect failed check' })).toBeTruthy();
  });

  it("tints each item's disc by its status: recording in progress, an open pickup session a warning, a failed check danger (kinds/statusTone.ts)", () => {
    view(<NextUp inputs={NEXT_UP_BUSY} record={record} onGo={noop} timer={timer} />);
    const items = within(screen.getByRole('list', { name: 'Next up' })).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('[data-tone]')?.getAttribute('data-tone'))).toEqual(['info', 'warning', 'danger']);
  });

  // The mock's `.next .ico` (app.css:125): a 30 px rounded square, not a 24 px circle.
  it('draws each disc as a 30 px square on an 8 px radius', () => {
    view(<NextUp inputs={NEXT_UP_BUSY} record={record} onGo={noop} timer={timer} />);
    const disc = within(screen.getByRole('list', { name: 'Next up' }))
      .getAllByRole('listitem')[0]!
      .querySelector('[data-tone]') as HTMLElement;
    expect(disc.className).toContain('size-[1.875rem]');
    expect(disc.className).toContain('rounded-lg');
    expect(disc.className).not.toContain('rounded-full');
  });

  it('says "Nothing needs you right now." when empty', () => {
    view(<NextUp inputs={NEXT_UP_EMPTY} record={record} onGo={noop} timer={timer} />);
    expect(screen.getByText('Nothing needs you right now.')).toBeTruthy();
  });

  it('open-booth-is-navigation: it stays enabled when recording is off, and the capability sentence is a note beside it (#1721)', async () => {
    const onGo = vi.fn();
    view(<NextUp inputs={NEXT_UP_BUSY} record={{ ok: false, reason: 'Recording needs a connected recorder.' }} onGo={onGo} timer={timer} />);
    const open = screen.getByRole('button', { name: 'Open Booth' }) as HTMLButtonElement;
    expect(open.disabled).toBe(false);
    expect(screen.getByText('Recording needs a connected recorder.')).toBeTruthy();
    await userEvent.click(open);
    expect(onGo).toHaveBeenCalledWith('booth', 'c4');
  });

  it('goes to the Booth, Pickups and Master', async () => {
    const onGo = vi.fn();
    view(<NextUp inputs={NEXT_UP_BUSY} record={record} onGo={onGo} timer={timer} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open Booth' }));
    await userEvent.click(screen.getByRole('button', { name: 'Review pickups' }));
    await userEvent.click(screen.getByRole('button', { name: 'Inspect failed check' }));
    expect(onGo.mock.calls).toEqual([['booth', 'c4'], ['pickups'], ['master', 'c2']]);
  });

  it('timer-stays-as-built: Start timer is on the recording item and hidden while a timer runs', async () => {
    const onStart = vi.fn();
    const { rerender } = view(<NextUp inputs={NEXT_UP_BUSY} record={record} onGo={noop} timer={{ running: false, onStart }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start timer on Chapter 4' }));
    expect(onStart).toHaveBeenCalledWith('c4', 'recording');
    rerender(
      <TooltipProvider>
        <NextUp inputs={NEXT_UP_BUSY} record={record} onGo={noop} timer={{ running: true, onStart }} />
      </TooltipProvider>,
    );
    expect(screen.queryByRole('button', { name: /Start timer/ })).toBeNull();
  });
});

describe('useStageTimer', () => {
  const session = { id: 's1', chapterId: 'c4', stage: 'recording', startedAt: '2026-10-11T10:00:00Z', source: 'manual' } as const;

  it('calls productionStartTimer and says why a start was refused', async () => {
    const api = {
      productionStartTimer: vi.fn().mockResolvedValue({ status: 'refused', reason: 'timer_running', message: 'Another timer is running.' }),
      productionStopTimer: vi.fn(),
    } satisfies Pick<NarrationApi, 'productionStartTimer' | 'productionStopTimer'>;
    const onChange = vi.fn();
    const { result } = renderHook(() => useStageTimer(api as never, onChange));
    await act(() => result.current.start('c4', 'recording'));
    expect(api.productionStartTimer).toHaveBeenCalledWith('c4', 'recording');
    expect(result.current.problem).toBe('Another timer is running.');
    expect(onChange).toHaveBeenCalled();
  });

  it('calls productionStopTimer and says what was logged', async () => {
    const api = { productionStartTimer: vi.fn(), productionStopTimer: vi.fn().mockResolvedValue({ stopped: true, session }) };
    const { result } = renderHook(() => useStageTimer(api as never, vi.fn()));
    await act(() => result.current.stop(() => 'Chapter 4'));
    expect(result.current.notice).toBe('Timer stopped: the session on Chapter 4 is logged.');
  });
});

describe('PageHeader', () => {
  const header = (over: Partial<Parameters<typeof PageHeader>[0]> = {}) => {
    const handlers = { onStopTimer: vi.fn(), onStartSession: vi.fn(), onExport: vi.fn(), onOpenSchedule: vi.fn() };
    view(
      <PageHeader
        chapters={5}
        words={46500}
        k={calcFor(MID_BOOK)}
        today={STORY_TODAY}
        due={STORY_DUE}
        record={{ ok: true, reason: '' }}
        timerRunning={false}
        {...handlers}
        {...over}
      />,
    );
    return handlers;
  };

  it('header-shows-deadline-tone-verdict-and-actions: figures, the due date, the verdict that opens Schedule, Export and Start session', async () => {
    const h = header();
    expect(screen.getByRole('heading', { level: 1, name: 'Production' })).toBeTruthy();
    expect(screen.getByText(/5 chapters · 46,500 words · delivery due/)).toBeTruthy();
    expect(screen.getByText('Oct 31')).toBeTruthy();
    expect(screen.getByText(/30 days/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /(On track|Tight|Behind)/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Export status report' }));
    await userEvent.click(screen.getByRole('button', { name: 'Start session' }));
    expect(h.onOpenSchedule).toHaveBeenCalledOnce();
    expect(h.onExport).toHaveBeenCalledOnce();
    expect(h.onStartSession).toHaveBeenCalledOnce();
  });

  it('draws blocks, not figures, the due date or a verdict, while the production log is read, and keeps the title and the actions', () => {
    header({ loading: true, chapters: 0, words: 0, due: null });
    expect(screen.getByRole('heading', { level: 1, name: 'Production' })).toBeTruthy();
    expect(screen.queryByText(/chapters/)).toBeNull();
    expect(screen.queryByText(/no delivery date set/)).toBeNull();
    expect(screen.queryByText('No due date set')).toBeNull();
    expect(screen.queryByRole('button', { name: /(On track|Tight|Behind|No due date set)/ })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export status report' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start session' })).toBeTruthy();
  });

  it('says "0 chapters" and "no delivery date set" once a read that found nothing has ended', () => {
    header({ loading: false, chapters: 0, words: 0, due: null });
    expect(screen.getByText(/0 chapters · 0 words · no delivery date set/)).toBeTruthy();
    expect(screen.getByText('No due date set')).toBeTruthy();
  });

  it('says the tone in a word and a shape when the due date is close', () => {
    header({ due: new Date(2026, 9, 5), k: calcFor(MID_BOOK, new Date(2026, 9, 5)) });
    expect(screen.getByText(/due soon|overdue or behind/)).toBeTruthy();
  });

  it('disables Start session with the record capability reason', () => {
    header({ record: { ok: false, reason: 'No recorder is connected.' } });
    const button = screen.getByRole('button', { name: 'Start session' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText('No recorder is connected.')).toBeTruthy();
  });

  it('offers the settings that switch recording on when that is the reason Start session is off', async () => {
    const onOpenSettings = vi.fn();
    header({ record: { ok: false, reason: 'Experimental: switched off in Settings.', inSettings: true }, onOpenSettings });
    await userEvent.click(screen.getByRole('button', { name: 'Open DAW settings' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('offers no settings link for a reason Settings cannot fix', () => {
    header({ record: { ok: false, reason: 'No recorder is connected.' }, onOpenSettings: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Open DAW settings' })).toBeNull();
  });

  it('shows Stop timer only while a timer runs', async () => {
    const h = header({ timerRunning: true });
    await userEvent.click(screen.getByRole('button', { name: 'Stop timer' }));
    expect(h.onStopTimer).toHaveBeenCalledOnce();
  });

  it('says so with no delivery date', () => {
    header({ due: null, k: calcFor(MID_BOOK, null) });
    expect(screen.getByText(/no delivery date set/)).toBeTruthy();
  });
});

describe('DawBanner and NoManuscript', () => {
  it('banner-and-empty-state: the banner shows only when the DAW is unreachable, with Retry and the built-in recorder', async () => {
    const onRetry = vi.fn();
    const onUseBuiltIn = vi.fn();
    const { rerender } = view(<DawBanner reachable daw="REAPER" onRetry={onRetry} onUseBuiltIn={onUseBuiltIn} />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(
      <TooltipProvider>
        <DawBanner reachable={false} daw="REAPER" onRetry={onRetry} onUseBuiltIn={onUseBuiltIn} />
      </TooltipProvider>,
    );
    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain('REAPER is not running.');
    expect(banner.textContent).toContain('Progress that comes from REAPER may be out of date until it is running again.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use built-in recorder' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onUseBuiltIn).toHaveBeenCalledOnce();
  });

  it('the banner offers Connect, naming the DAW, only when the page can connect it', async () => {
    const onConnect = vi.fn();
    const { rerender } = view(<DawBanner reachable={false} daw="REAPER" onRetry={vi.fn()} onUseBuiltIn={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Connect REAPER' })).toBeNull();
    rerender(
      <TooltipProvider>
        <DawBanner reachable={false} daw="REAPER" onRetry={vi.fn()} onConnect={onConnect} onUseBuiltIn={vi.fn()} />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Connect REAPER' }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('the no-manuscript state offers the import button given as a prop and a Set a due date icon', async () => {
    const onSetDueDate = vi.fn();
    view(<NoManuscript projectName="A project" importButton={<button type="button">Import manuscript</button>} onSetDueDate={onSetDueDate} />);
    expect(screen.getByText('Start by importing your manuscript')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import manuscript' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Set a due date' }));
    expect(onSetDueDate).toHaveBeenCalledOnce();
  });
});
