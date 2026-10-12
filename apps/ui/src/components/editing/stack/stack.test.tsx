// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { OverlayHost } from '../../../overlay/OverlayHost';
import { overlay } from '../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { createJournal, type Journal } from '../../../studio/journal/createJournal';
import { buildWordMenu } from '../menu/wordMenuRegistry';
import { summarize } from '../model';
import { TakeLines } from '../takes/TakeLines';
import type { LinePassage } from '../takes/types';
import { RetryBar } from './RetryBar';
import { beforeStack, type BeforeStackStep } from './stackCommand';
import { chapterLines, CHAPTER, fakeStackLog, recorderCaps, stackLine, stepsCaps } from './stackFixtures';
import { stackedView } from './stackedLine';
import { planStack } from './stackPlan';
import { KEPT_REASON, NO_BACKUP, STACK_TEXT } from './stackText';
import type { StackLine } from './types';
import { useStackRetries, type StackRetries } from './useStackRetries';
import { marksDoc } from '../script/scriptFixtures';

let journal: Journal;
let log: ReturnType<typeof fakeStackLog>;
let dawCalls: string[];
let stack: StackRetries;
let toast: ReturnType<typeof vi.spyOn>;
let hide: ReturnType<typeof vi.fn>;
let refuseStack: string | null;

const PROJECT = { chapterIds: [CHAPTER], candidateIds: [], findingIds: [], passageIds: ['p-1', 'p-2', 'p-3'] };

const linePassage = (l: StackLine): LinePassage => ({
  id: l.id,
  chapterId: l.chapterId,
  firstToken: l.firstToken,
  lastToken: l.lastToken,
  script: l.script,
  takes: l.takes.map((t) => ({
    id: t.id,
    label: t.id.toUpperCase(),
    active: t.id === l.keptId,
    usable: true,
    sourceFile: `${t.id}.wav`,
    sourceStart: 0,
    sourceLength: t.len,
  })),
});

function Harness({ lines }: { lines: StackLine[] }) {
  stack = useStackRetries({ journal, chapterId: CHAPTER, lines, passageOf: () => lines[0] ?? null });
  return (
    <main>
      <RetryBar
        level="chapter"
        chapterId={CHAPTER}
        count={stack.count}
        reason={stack.reasonFor()}
        onStack={() => stack.requestStack()}
        onChange={stack.refresh}
      />
      {lines
        .filter((l) => l.takes.length > 1)
        .map((l) => (
          <TakeLines
            key={l.id}
            passage={linePassage(l)}
            onTake={null}
            keptId={l.keptId}
            playingId={null}
            gate={{ ok: true }}
            onKeep={vi.fn()}
            onPlay={vi.fn()}
          />
        ))}
    </main>
  );
}

function mount(lines: StackLine[], setup: DawSetupId | DawCapabilities = 'reaper') {
  const caps = typeof setup === 'string' ? DAW_SETUPS[setup] : setup;
  const base = createMockDawClient(caps, PROJECT);
  const daw: DawClient = {
    ...base,
    stackTakes: (r) => (
      dawCalls.push(`stack ${r.groups.map((g) => g.passageId).join(',')} shift=${r.shift}`),
      refuseStack ? Promise.resolve(refused(refuseStack)) : base.stackTakes(r)
    ),
    unstackTakes: (r) => (dawCalls.push(`unstack ${r.groups.map((g) => g.passageId).join(',')}`), base.unstackTakes(r)),
    hideTakes: hide as DawClient['hideTakes'],
  };
  const api = Object.assign(createMockApi(), log);
  const view = (l: StackLine[]) => (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw }}>
        <Harness lines={l} />
        <OverlayHost />
      </PortOverrides>
    </ApiProvider>
  );
  const out = render(view(lines));
  return { ...out, again: (l: StackLine[]) => out.rerender(view(l)) };
}

const refused = (reason: string): DawResult => ({ ok: false, changed: false, message: reason, undoSteps: 0, refused: reason });
const flush = () => act(async () => {});
const dialog = () => screen.getByRole('dialog');
const text = (attr: string) => dialog().querySelector(`[${attr}]`)?.textContent ?? '';
const chapterStack = () => document.querySelector<HTMLButtonElement>('[data-retry-bar="chapter"] [data-stack-all]')!;
const passageStack = (id: string) => document.querySelector<HTMLButtonElement>(`[data-stack-controls="${id}"] [data-stack-all]`);
const unstackButton = (id: string) => document.querySelector<HTMLButtonElement>(`[data-stack-controls="${id}"] [data-unstack]`);
const choose = async (group: string, name: string) => {
  fireEvent.click(within(screen.getByRole('group', { name: group })).getByRole('button', { name }));
  await flush();
};
const go = async (name: string) => {
  fireEvent.click(within(dialog()).getByRole('button', { name }));
  await flush();
};

/** p-1 and p-2 already stacked: their later reads sit on the first read's spot and the log remembers where they were. */
function stackedLines(over: Partial<StackLine> = {}): StackLine[] {
  log.stacks.push({
    id: 'stk-p-1',
    chapterId: CHAPTER,
    passageId: 'p-1',
    base: 't-1',
    offsets: { 't-2': 10, 't-3': 20 },
    mode: 'native',
    undoSteps: 1,
    at: '2026-10-12T10:00:00Z',
  });
  return [
    stackLine(
      'p-1',
      [
        { id: 't-1', start: 10, len: 4 },
        { id: 't-2', start: 10, len: 4 },
        { id: 't-3', start: 10, len: 4 },
      ],
      over,
    ),
    stackLine('p-3', [{ id: 't-6', start: 60, len: 3 }]),
  ];
}

beforeEach(() => {
  journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
  log = fakeStackLog();
  dawCalls = [];
  refuseStack = null;
  hide = vi.fn(async () => ({ ok: true, changed: true, message: 'Hid 2 other takes in REAPER.', undoSteps: 1 }));
  toast = vi.spyOn(overlay, 'toast');
  beforeStack.length = 0;
});
afterEach(() => {
  overlay.getSnapshot().dialogs.forEach((d) => (d.kind === 'confirm' ? d.answer(false) : d.close()));
  overlay.getSnapshot().toasts.forEach((t) => overlay.dismissToast(t.id));
  cleanup();
  vi.restoreAllMocks();
});

describe('the plan dialog', () => {
  beforeEach(() => log.modes.set('c:chapter-1', 'stack'));

  it('dialog-shows-the-plan-first: passages, time ranges, takes, the shift and the undo sentence; nothing moves until Stack takes; Cancel changes nothing', async () => {
    mount(chapterLines());
    await flush();
    fireEvent.click(chapterStack());
    expect(dialog().getAttribute('aria-label') ?? within(document.body).getByRole('dialog', { name: STACK_TEXT.action })).toBeTruthy();
    expect(text('data-stack-summary')).toBe('3 takes in 2 passages move onto the first read’s spot. The audio that follows moves 30.0 s earlier.');
    expect(dialog().querySelector('[data-stack-group="p-1"] [data-stack-span]')?.textContent).toBe('0:10–0:34 → 0:10–0:14');
    expect(text('data-stack-undo')).toContain('one undo step');
    expect(dawCalls).toEqual([]);
    expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await go('Cancel');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(dawCalls).toEqual([]);
    expect(log.calls.filter((c) => c.startsWith('record'))).toEqual([]);
  });

  it('one-passage-and-the-whole-chapter: later groups show positions after the earlier ones moved up, as one journal entry', async () => {
    mount(chapterLines());
    await flush();
    fireEvent.click(chapterStack());
    expect(dialog().querySelector('[data-stack-move="t-2"]')?.textContent).toBe('t-2 · 0:20–0:24 → 0:10–0:14');
    expect(dialog().querySelector('[data-stack-move="t-5"]')?.textContent).toBe('t-5 · 0:40–0:45 → 0:30–0:35');
    expect(dialog().querySelector('[data-stack-group="p-2"] [data-stack-span]')?.textContent).toBe('0:30–0:45 → 0:30–0:35');
    await go('Stack takes');
    expect(dawCalls).toEqual(['stack p-1,p-2 shift=-30']);
    const rows = await journal.entries();
    expect(rows.map((r) => r.label)).toEqual(['Stacked 3 retries as takes']);

    // One passage: the control under its takes asks the same question about it alone.
    fireEvent.click(passageStack('p-2')!);
    expect(text('data-stack-summary')).toBe('1 take in 1 passage move onto the first read’s spot. The audio that follows moves 10.0 s earlier.');
    expect(dialog().querySelector('[data-stack-group="p-1"]')).toBeNull();
  });
});

describe('stack and un-stack', () => {
  beforeEach(() => log.modes.set('c:chapter-1', 'stack'));

  it('stack-and-unstack-are-daw-first-and-recorded: the offsets are recorded after the DAW accepts; un-stack asks with the positions and removes them', async () => {
    mount(chapterLines());
    await flush();
    fireEvent.click(chapterStack());
    await go('Stack takes');
    expect(dawCalls).toEqual(['stack p-1,p-2 shift=-30']);
    expect(log.calls.filter((c) => c.startsWith('record'))).toEqual(['record p-1 t-2@10,t-3@20 native undo=1', 'record p-2 t-5@10 native undo=1']);
    expect(toast).toHaveBeenCalledWith('Stacked 3 takes in REAPER.');
    // The journal entry says where to undo it: a stack is not undoable in the app.
    const [row] = await journal.entries();
    expect(row.undoable).toBe(false);
    expect(row.refusal).toBe('Undo it in REAPER.');
    cleanup();

    // Un-stack on a page that read the record back: the question names where the takes return to.
    log.calls.length = 0;
    log.stacks.length = 0;
    dawCalls.length = 0;
    mount(stackedLines());
    await flush();
    fireEvent.click(unstackButton('p-1')!);
    await flush();
    expect(dialog()).toBeTruthy();
    expect(text('data-stack-summary')).toBe('2 takes in 1 passage go back to where they were recorded. The audio that follows moves 20.0 s later.');
    expect(dialog().querySelector('[data-stack-move="t-2"]')?.textContent).toBe('t-2 · 0:10–0:14 → 0:20–0:24');
    expect(dialog().querySelector('[data-stack-move="t-3"]')?.textContent).toBe('t-3 · 0:10–0:14 → 0:30–0:34');
    expect(dawCalls).toEqual([]);
    await go('Put them back');
    expect(dawCalls).toEqual(['unstack p-1']);
    expect(log.calls.filter((c) => c.startsWith('remove'))).toEqual(['remove p-1 t-2,t-3']);
    expect(log.stacks).toEqual([]);
  });

  it('a refusal records nothing: neither a DAW that answers no nor one that is not running', async () => {
    refuseStack = 'REAPER cannot stack these takes right now.';
    mount(chapterLines());
    await flush();
    fireEvent.click(chapterStack());
    await go('Stack takes');
    expect(dawCalls).toHaveLength(1);
    expect(toast).toHaveBeenCalledWith('REAPER cannot stack these takes right now.', { tone: 'error' });
    expect(log.calls.filter((c) => c.startsWith('record'))).toEqual([]);
    expect(await journal.entries()).toEqual([]);
  });

  it('says where to undo when the DAW stacked and the record could not be kept', async () => {
    log = fakeStackLog({ refuseRecord: 'the record is full' });
    log.modes.set('c:chapter-1', 'stack');
    mount(chapterLines());
    await flush();
    fireEvent.click(chapterStack());
    await go('Stack takes');
    expect(toast).toHaveBeenCalledWith('the record is full REAPER stacked the takes: undo it there (Edit > Undo).', { tone: 'error' });
    expect(await journal.entries()).toEqual([]);
  });
});

describe('a kept take', () => {
  it('a-kept-take-blocks-stacking: both actions are disabled with "A take is kept" and are offered again when the keep is undone', async () => {
    log.modes.set('c:chapter-1', 'stack');
    const kept = { kept: true, keptId: 't-2' };
    const view = mount(stackedLines(kept));
    await flush();
    expect(unstackButton('p-1')!.closest('[aria-label]')?.getAttribute('aria-label')).toBe(KEPT_REASON);
    expect(screen.getAllByLabelText(KEPT_REASON).length).toBeGreaterThan(0);
    await act(async () => stack.requestUnstack('p-1'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toast).toHaveBeenCalledWith('Undo the kept take first.');

    view.again(stackedLines());
    await flush();
    expect(unstackButton('p-1')!.disabled).toBe(false);
    fireEvent.click(unstackButton('p-1')!);
    await flush();
    expect(dialog()).toBeTruthy();
  });
});

describe('what the DAW can do', () => {
  beforeEach(() => log.modes.set('c:chapter-1', 'stack'));

  it('audacity-needs-backups: without them the dialog does not open and the reason is on the control; with them it lists the edits and the backup', async () => {
    const view = mount(chapterLines(), stepsCaps(false));
    await flush();
    const reason = 'Audacity keeps backups only when you turn them on.';
    expect(screen.getAllByLabelText(reason).length).toBeGreaterThan(0);
    expect(chapterStack().disabled).toBe(true);
    act(() => stack.requestStack());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toast).toHaveBeenCalledWith(reason, { tone: 'error' });
    view.unmount();

    mount(chapterLines(), stepsCaps(true));
    await flush();
    fireEvent.click(chapterStack());
    expect([...dialog().querySelectorAll('[data-stack-steps] li')].map((li) => li.textContent)).toEqual([
      'Add a take track',
      'Paste each later read into it',
      'Split at the point where the reads line up',
      'Shift the audio that follows to close the gap',
      'Mute the reads that are not on top',
    ]);
    expect(text('data-stack-backup')).toBe('Backup first: 0:10–1:05');
    expect(text('data-stack-undo')).toContain('5 undo steps');
  });

  it('a steps DAW is backed up first; with no backup step the stack is refused and nothing changes', async () => {
    mount(chapterLines(), stepsCaps(true));
    await flush();
    fireEvent.click(chapterStack());
    await go('Stack takes');
    expect(toast).toHaveBeenCalledWith(NO_BACKUP, { tone: 'error' });
    expect(dawCalls).toEqual([]);

    const step: BeforeStackStep = { name: 'backup', run: vi.fn(async () => ({ ok: true as const, value: { backupId: 'bk-1' } })) };
    beforeStack.push(step);
    fireEvent.click(chapterStack());
    await go('Stack takes');
    expect(step.run).toHaveBeenCalledWith({ chapterId: CHAPTER, region: { start: 10, end: 65 }, label: 'Stack retries as takes' });
    expect(log.calls.filter((c) => c.startsWith('record'))[0]).toMatch(/steps undo=5 backup=bk-1$/);
  });

  it('the recorder says the app makes the change itself and calls no DAW', async () => {
    mount(chapterLines(), recorderCaps());
    await flush();
    fireEvent.click(chapterStack());
    expect(text('data-stack-undo')).toContain('The app makes this change itself');
    await go('Stack takes');
    expect(dawCalls).toEqual([]);
    expect(log.calls.filter((c) => c.startsWith('record'))[0]).toBe('record p-1 t-2@10,t-3@20 app undo=0');
  });

  it('disabled-controls-keep-their-reason: every stack control the DAW cannot do is off with the DAW’s sentence', async () => {
    mount(stackedLines(), 'reaper-off');
    await flush();
    const reason = DAW_SETUPS['reaper-off'].capabilities['stack_takes']!.message!;
    expect(chapterStack().disabled).toBe(true);
    expect(unstackButton('p-1')!.disabled).toBe(true);
    expect(screen.getAllByLabelText(reason).length).toBeGreaterThanOrEqual(2);
    const menu = buildWordMenu({ doc: marksDoc(), keys: ['p-1:0'], summary: summarize(marksDoc(), ['p-1:0'], [], (t) => t), play: vi.fn(), notify: vi.fn() });
    expect(
      menu.groups
        .flat()
        .filter((i) => i.key === 'unstack-takes')
        .map((i) => i.unavailable),
    ).toEqual([reason]);
  });

  it('planStack follows the capability: native, steps with backups, the app’s own, or the reason', () => {
    expect(planStack(DAW_SETUPS.reaper)).toEqual({ kind: 'daw', dawName: 'REAPER' });
    expect(planStack(stepsCaps(true)).kind).toBe('steps');
    expect(planStack(recorderCaps()).kind).toBe('recorder');
    expect(planStack(DAW_SETUPS['audacity-backups'])).toMatchObject({ kind: 'refused', reason: expect.stringContaining('Audacity') });
  });
});

describe('the retry bar', () => {
  it('retry-bar-shows-the-count-only-when-stacking: the choice is stack or leave, moves nothing and is stored through the port', async () => {
    mount(chapterLines());
    await flush();
    expect(document.querySelector('[data-stack-count]')).toBeNull();
    expect(chapterStack()).toBeNull();
    await choose('How retries are kept in this chapter', 'Stack');
    expect(log.calls).toContain('mode chapter stack');
    expect(document.querySelector('[data-stack-count]')?.textContent).toBe('3 retries can be stacked');
    expect(dawCalls).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
    await choose('How retries are kept in this chapter', 'Leave');
    expect(document.querySelector('[data-stack-count]')).toBeNull();
    expect(chapterStack()).toBeNull();
    expect(dawCalls).toEqual([]);
  });

  it('a passage can follow its chapter, or choose for itself', async () => {
    log.modes.set('c:chapter-1', 'stack');
    mount(chapterLines());
    await flush();
    const group = 'How retries are kept in this passage';
    expect(
      within(screen.getAllByRole('group', { name: group })[0])
        .getByRole('button', { name: 'Chapter · Stack' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(within(screen.getAllByRole('group', { name: group })[0]).getByRole('button', { name: 'Leave' }));
    await flush();
    expect(log.calls).toContain('mode passage leave');
    expect(stack.lines.find((l) => l.id === 'p-1')?.retryMode).toBe('leave');
    fireEvent.click(within(screen.getAllByRole('group', { name: group })[0]).getByRole('button', { name: /^Chapter/ }));
    await flush();
    expect(log.calls).toContain('mode passage follow');
  });
});

describe('the stacked passage', () => {
  it('stacked-chip-and-lanes: a stacked line says Stacked and its takes sit on one spot, one lane each', () => {
    const lines = chapterLines();
    expect(stackedView(lines[0])).toEqual({ stacked: false, chip: null, lanes: {} });
    const stacked = stackLine(
      'p-1',
      [
        { id: 't-1', start: 10, len: 4 },
        { id: 't-2', start: 10, len: 4 },
        { id: 't-3', start: 10, len: 4 },
      ],
      {
        stack: { base: 't-1', offsets: { 't-2': 10, 't-3': 20 } },
      },
    );
    expect(stackedView(stacked)).toEqual({ stacked: true, chip: 'Stacked', lanes: { 't-1': 0, 't-2': 1, 't-3': 2 } });
  });
});

describe('leaving the takes where they are', () => {
  const keptLine = (over: Partial<StackLine> = {}) =>
    stackLine(
      'p-2',
      [
        { id: 't-4', start: 50, len: 5 },
        { id: 't-5', start: 60, len: 5 },
        { id: 't-7', start: 70, len: 5 },
      ],
      { kept: true, keptId: 't-5', hidden: ['t-7'], ...over },
    );

  it('leave-takes-offers-clean-up-after-a-keep: it asks, then hides the unkept reads through hideTakes and never deletes', async () => {
    mount([keptLine()]);
    await flush();
    const offer = document.querySelector<HTMLButtonElement>('[data-cleanup]')!;
    expect(offer.textContent).toBe(STACK_TEXT.cleanup);
    fireEvent.click(offer);
    await flush();
    expect(hide).not.toHaveBeenCalled();
    expect(within(screen.getByRole('alertdialog')).getByText(/Hide 1 other read \(t-4\)/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Hide the other reads' }));
    await flush();
    expect(hide).toHaveBeenCalledWith(CHAPTER, 1, 9, 't-5');
    expect((await journal.entries())[0].label).toBe('Hid 1 other read');
  });

  it('is not offered for a stacked passage, one set to stack, or one with nothing left to hide', async () => {
    log.modes.set('p:p-2', 'stack');
    const view = mount([keptLine()]);
    await flush();
    expect(document.querySelector('[data-cleanup]')).toBeNull();
    log.modes.delete('p:p-2');
    view.again([keptLine({ hidden: ['t-4', 't-7'] })]);
    await flush();
    expect(document.querySelector('[data-cleanup]')).toBeNull();
    view.again([keptLine({ stack: { base: 't-4', offsets: { 't-5': 10 } } })]);
    await flush();
    expect(document.querySelector('[data-cleanup]')).toBeNull();
  });
});

describe('the menu', () => {
  const items = () =>
    buildWordMenu({ doc: marksDoc(), keys: ['p-1:0'], summary: summarize(marksDoc(), ['p-1:0'], [], (t) => t), play: vi.fn(), notify: vi.fn() }).groups.flat();

  it('menu-section: the two items appear only when the line can be stacked or un-stacked and is set to stack', async () => {
    mount(chapterLines());
    await flush();
    expect(items().map((i) => i.key)).not.toContain('stack-retries');
    cleanup();
    log.modes.set('c:chapter-1', 'stack');
    mount(chapterLines());
    await flush();
    const stackItem = items().find((i) => i.key === 'stack-retries')!;
    expect(stackItem.label).toBe(STACK_TEXT.action);
    expect(stackItem.unavailable).toBeUndefined();
    expect(items().map((i) => i.key)).not.toContain('unstack-takes');
    act(() => stackItem.onSelect());
    expect(dialog()).toBeTruthy();
    cleanup();
    mount(stackedLines());
    await flush();
    expect(items().map((i) => i.key)).toContain('unstack-takes');
  });
});

describe('accessibility', () => {
  it('atlas-and-axe: the dialog is named and has no violations', async () => {
    log.modes.set('c:chapter-1', 'stack');
    mount(chapterLines());
    await flush();
    fireEvent.click(chapterStack());
    expect(screen.getByRole('dialog', { name: STACK_TEXT.action })).toBeTruthy();
    const result = await axe.run(dialog());
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
