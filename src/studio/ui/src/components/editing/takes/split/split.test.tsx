// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { createMockApi } from '../../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../../fixtures/daw';
import { overlay } from '../../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../../ports/daw';
import { PortOverrides } from '../../../../ports/usePort';
import { createJournal, type Journal } from '../../../../studio/journal/createJournal';
import { FlagCard } from '../../flags/FlagCard';
import { registerFlagAction } from '../../flags/flagActions';
import { marksDoc } from '../../script/scriptFixtures';
import { summarize, type ChapterDoc } from '../../model';
import { buildWordMenu } from '../../menu/wordMenuRegistry';
import { TakeLines } from '../TakeLines';
import { singleTakePassage } from '../takeFixtures';
import { SplitConfirmBody } from './SplitConfirm';
import { NO_SPLIT_COMMAND, planSplit } from './splitPlan';
import { fakeSplitter, target } from './splitFixtures';
import { dawSplitter } from './splitCommand';
import { splitTargetOf } from './splitTarget';
import { useSplitDuplicate } from './useSplitDuplicate';
import type { TakeSplitter } from './splitPlan';

let journal: Journal;
let calls: string[];
let splitter: TakeSplitter | undefined;
let confirm: ReturnType<typeof vi.spyOn>;
let toast: ReturnType<typeof vi.spyOn>;
let toastUndo: ReturnType<typeof vi.spyOn>;
let dawCalls: string[];
const deleteWords = vi.fn();

const dupDoc = (): ChapterDoc => {
  const d = marksDoc();
  d.paras[1].items.slice(0, 2).forEach((i) => {
    i.dup = true;
  });
  return d;
};

function Harness() {
  useSplitDuplicate({ journal, splitter, resolve: (id) => (id === 'p-2' || id === 'ps-9' ? target : null) });
  const doc = dupDoc();
  return (
    <main>
      <FlagCard doc={doc} dp={doc.paras[1]} flag="dup:p-2" hear={null} accept={vi.fn()} onClose={onClose} />
      <TakeLines
        passage={{ ...singleTakePassage(), id: 'ps-9' }}
        onTake={null}
        keptId={null}
        playingId={null}
        gate={{ ok: true }}
        onKeep={vi.fn()}
        onPlay={vi.fn()}
      />
    </main>
  );
}
const onClose = vi.fn();

function mount(setup: DawSetupId = 'reaper', base: DawClient = createMockDawClient(DAW_SETUPS[setup])) {
  // Every method the app asks of the DAW is recorded: the built-in recorder must not appear here.
  const daw = new Proxy(base, {
    get: (t, k: keyof DawClient) =>
      typeof t[k] === 'function' ? (...a: unknown[]) => (k !== 'capabilities' && dawCalls.push(String(k)), (t[k] as (...x: unknown[]) => unknown)(...a)) : t[k],
  });
  return render(
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw }}>
        <Harness />
      </PortOverrides>
    </ApiProvider>,
  );
}
const flush = () => act(async () => {});
const stack = () => screen.getByRole('button', { name: 'Stack as 2 takes' });
const splitButton = () => document.querySelector<HTMLButtonElement>('[data-tsplit]')!;

beforeEach(() => {
  journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });
  calls = [];
  dawCalls = [];
  splitter = fakeSplitter(calls);
  confirm = vi.spyOn(overlay, 'confirm').mockResolvedValue(true);
  toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
  toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => {});
  onClose.mockClear();
  deleteWords.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('card-answers-split-leave-delete', () => {
  it('Stack as 2 takes splits; Leave in place changes nothing; Delete second read… opens the delete question; the card deletes nothing', async () => {
    const off = registerFlagAction('deleteWords', deleteWords);
    mount();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Leave in place' }));
    expect(onClose).toHaveBeenCalled();
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete second read…' }));
    expect(deleteWords).toHaveBeenCalledWith(['p-2:0', 'p-2:1']);
    expect(calls).toEqual([]);
    fireEvent.click(stack());
    await waitFor(() => expect(calls).toEqual(['splitTake t-12 621.2']));
    expect(deleteWords).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('the word menu offers Split into takes', () => {
  it('on a line whose one take reads it twice, and splits from it', async () => {
    mount();
    await flush();
    const doc = dupDoc();
    const keys = ['p-2:0'];
    const menu = buildWordMenu({ doc, keys, summary: summarize(doc, keys, [], (t) => t), play: vi.fn(), notify: vi.fn() });
    const item = menu.groups.flat().find((i) => i.key === 'split-takes');
    expect(item?.label).toBe('Split into takes');
    act(() => item!.onSelect());
    await waitFor(() => expect(calls).toEqual(['splitTake t-12 621.2']));
    const other = ['p-1:0'];
    const none = buildWordMenu({ doc, keys: other, summary: summarize(doc, other, [], (t) => t), play: vi.fn(), notify: vi.fn() });
    expect(none.groups.flat().some((i) => i.key === 'split-takes')).toBe(false);
  });
});

describe('split-asks-first-and-is-one-undo', () => {
  it('names the time, the DAW and how it is undone; Cancel changes nothing; accepting is one history entry', async () => {
    mount();
    await flush();
    confirm.mockResolvedValueOnce(false);
    fireEvent.click(stack());
    await flush();
    expect(calls).toEqual([]);
    expect(await journal.entries()).toHaveLength(0);
    fireEvent.click(stack());
    await waitFor(() => expect(calls).toHaveLength(1));
    const spec = confirm.mock.calls[0][0] as { title: string; body: unknown; confirmLabel: string };
    const text = renderToStaticMarkup(spec.body as never);
    expect(text).toContain('10:21');
    expect(text).toContain('REAPER');
    expect(text).toMatch(/one undo step in REAPER/);
    expect(spec.confirmLabel).toBe('Split take');
    expect(await journal.entries()).toHaveLength(1);
  });
});

describe('a-daw-that-cannot-refuses-with-its-reason', () => {
  it('leaves the take whole and shows the capability’s sentence on the button and in the toast', async () => {
    mount('reaper-off');
    await flush();
    const sentence = DAW_SETUPS['reaper-off'].capabilities['takes'].message!;
    expect(splitButton().disabled).toBe(true);
    expect(splitButton().closest('[role="group"]')?.getAttribute('aria-label')).toBe(sentence);
    fireEvent.click(stack());
    await flush();
    expect(toast).toHaveBeenCalledWith(sentence, { tone: 'error' });
    expect(confirm).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('a DAW answer that refuses the cut leaves the take whole and shows its sentence', async () => {
    splitter = { ...fakeSplitter(calls), splitTake: async () => ({ ok: false, changed: false, message: 'No.', refused: 'The item moved.', undoSteps: 0 }) };
    mount();
    await flush();
    fireEvent.click(stack());
    await waitFor(() => expect(toast).toHaveBeenCalledWith('The item moved.', { tone: 'error' }));
    expect(await journal.entries()).toHaveLength(0);
  });

  it('with no split command wired in, says so and asks nothing', async () => {
    splitter = undefined;
    mount();
    await flush();
    fireEvent.click(stack());
    await flush();
    expect(toast).toHaveBeenCalledWith(NO_SPLIT_COMMAND, { tone: 'error' });
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('the-page-passes-the-ports-splitter', () => {
  const project = { chapterIds: ['5'], candidateIds: [], findingIds: [], splitTakes: { 't-12': { start: 600, length: 60 } } };
  const dawWith = (setup: DawSetupId) => createMockDawClient(DAW_SETUPS[setup], project);

  it('a split is one DAW change and one undo, and a DAW without it says why', async () => {
    // REAPER: one splitTake call with the chapter, the take and the time; one journal entry, undone in REAPER's own history.
    const reaper = dawWith('reaper');
    const splitTake = vi.spyOn(reaper, 'splitTake');
    splitter = dawSplitter(reaper, '5');
    mount('reaper', reaper);
    await flush();
    fireEvent.click(stack());
    await waitFor(() => expect(splitTake).toHaveBeenCalledTimes(1));
    expect(splitTake).toHaveBeenCalledWith('5', 't-12', 621.2);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/^Split T-12 at 10:21\./)));
    const entries = await journal.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ label: 'Split T-12 at the second read', daw: true, undoable: false, refusal: 'Undo the split in REAPER.' });
    expect((await splitTake.mock.results[0].value).undoSteps).toBe(1);

    // The recorder: the host's own sentence, the take stays whole and nothing is journaled.
    cleanup();
    const recorder = dawWith('builtin');
    vi.spyOn(recorder, 'splitTake').mockResolvedValue({
      ok: false,
      changed: false,
      message: 'No.',
      refused: 'The built-in recorder cannot split a take into two yet.',
      undoSteps: 0,
    });
    journal.clear();
    splitter = dawSplitter(recorder, '5');
    mount('builtin', recorder);
    await flush();
    fireEvent.click(stack());
    await waitFor(() => expect(toast).toHaveBeenCalledWith('The built-in recorder cannot split a take into two yet.', { tone: 'error' }));
    expect(await journal.entries()).toHaveLength(0);

    // A take the DAW no longer has: refused as stale, with the DAW's sentence, and nothing is journaled.
    cleanup();
    const gone = createMockDawClient(DAW_SETUPS.reaper, { ...project, splitTakes: {} });
    splitter = dawSplitter(gone, '5');
    mount('reaper', gone);
    await flush();
    fireEvent.click(stack());
    await waitFor(() =>
      expect(toast).toHaveBeenLastCalledWith(expect.stringMatching(/no longer on this chapter's track in the REAPER project/), { tone: 'error' }),
    );
    expect(await journal.entries()).toHaveLength(0);
  });

  it('with Audacity backups on, the page has no backup around a time to make, so it refuses before the DAW is asked', async () => {
    const audacity = dawWith('audacity-backups');
    const splitTake = vi.spyOn(audacity, 'splitTake');
    splitter = dawSplitter(audacity, '5');
    mount('audacity-backups', audacity);
    await flush();
    fireEvent.click(stack());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(NO_SPLIT_COMMAND, { tone: 'error' }));
    expect(splitTake).not.toHaveBeenCalled();
    expect(await journal.entries()).toHaveLength(0);
  });
});

describe('built-in-recorder-cuts-its-own-take', () => {
  it('is the recorder’s own action and no DAW method is called; its Undo joins the takes', async () => {
    mount('builtin');
    await flush();
    fireEvent.click(stack());
    await waitFor(() => expect(calls).toEqual(['cutOwnTake t-12 621.2']));
    expect(dawCalls).toEqual([]);
    expect(renderToStaticMarkup((confirm.mock.calls[0][0] as { body: never }).body)).toContain('built-in recorder');
    expect(toastUndo).toHaveBeenCalled();
    await (toastUndo.mock.calls[0][1] as () => Promise<unknown>)();
    expect(calls).toEqual(['cutOwnTake t-12 621.2', 'joinOwnTakes t-12']);
  });
});

describe('audacity-backs-up-first', () => {
  it('with backups the backup call comes before the split', async () => {
    mount('audacity-backups');
    await flush();
    fireEvent.click(stack());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls).toEqual(['backupAround 5 621.2', 'splitTake t-12 621.2']);
  });

  it('a refused backup leaves the take uncut', async () => {
    splitter = {
      ...fakeSplitter(calls),
      backupAround: async () => ({ ok: false, changed: false, message: 'Disk full.', refused: 'Disk full.', undoSteps: 0 }),
    };
    mount('audacity-backups');
    await flush();
    fireEvent.click(stack());
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Disk full.', { tone: 'error' }));
    expect(calls).toEqual([]);
  });

  it('without backups the split is refused with the reason', async () => {
    mount('audacity');
    await flush();
    fireEvent.click(stack());
    await flush();
    expect(toast).toHaveBeenCalledWith('Keeping takes needs Audacity backups. Turn on Audio backups in Settings.', { tone: 'error' });
    expect(calls).toEqual([]);
  });
});

describe('planSplit', () => {
  it.each([
    ['reaper', 'daw'],
    ['builtin', 'recorder'],
    ['audacity-backups', 'backup-then-daw'],
    ['audacity', 'refused'],
    ['reaper-off', 'refused'],
  ] as const)('%s → %s', (setup, kind) => expect(planSplit(DAW_SETUPS[setup]).kind).toBe(kind));
});

describe('atlas-and-axe', () => {
  it('the confirmation and the footer button have no axe violations', async () => {
    mount();
    await flush();
    const { container } = render(<SplitConfirmBody plan={{ kind: 'daw', dawName: 'REAPER' }} target={target} />);
    const results = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
    expect(container.textContent).toContain('10:21');
  });
});

describe('finding-the-cut', () => {
  const say = (text: string, from: number) => text.split(' ').map((word, i) => ({ text: word, off0: from + i * 0.4, off1: from + i * 0.4 + 0.3, conf: 0.9 }));
  const line = 'Serpent screamed the Pigeon again';
  const source = { chapterId: '5', takeId: 't-12', label: 'T-12', script: line, projectStart: 600, heard: [...say(line, 0), ...say(line, 5)] };

  it('cuts in the pause before the second read, in chapter time', () => {
    const t = splitTargetOf(source, 1)!;
    expect(t.at).toBeGreaterThan(600 + 1.9);
    expect(t.at).toBeLessThan(605);
  });

  it('offers nothing for a take read once, or for a line that already has several takes', () => {
    expect(splitTargetOf({ ...source, heard: say(line, 0) }, 1)).toBeNull();
    expect(splitTargetOf(source, 2)).toBeNull();
  });
});
