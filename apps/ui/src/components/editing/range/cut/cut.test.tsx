// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { COMMAND_CATALOG } from '../../../../input/commands.catalog';
import { gesture } from '../../../../input/gestures';
import type { GestureEvent, InputSource } from '../../../../input/InputSource';
import { defaultKeymap } from '../../../../input/keymap';
import { CommandRouter, CommandScope } from '../../../../input/router';
import { useEditingKeys } from '../../keys/useEditingKeys';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import type { DawCapabilities } from '../../../../api/contracts/daw';
import type { EditCut } from '../../../../api/contracts/editCuts';
import { createMockApi } from '../../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../../fixtures/daw';
import { OverlayHost } from '../../../../overlay/OverlayHost';
import { overlay } from '../../../../overlay/overlayService';
import type { AlignmentPort } from '../../../../ports/alignment';
import { createMockDawClient, type DawClient } from '../../../../ports/daw';
import { PortOverrides } from '../../../../ports/usePort';
import { createJournal, type Journal } from '../../../../studio/journal/createJournal';
import { SelectionBar } from '../../bar/SelectionBar';
import type { ScriptPlayback } from '../../bar/useScriptPlayback';
import { useFlagActions } from '../../flags/flagActions';
import { buildWordMenu } from '../../menu/wordMenuRegistry';
import { summarize, type ChapterDoc } from '../../model';
import { EditingPageProvider, useEditingPage } from '../../script/EditingPageState';
import { marksDoc } from '../../script/scriptFixtures';
import { docCutsOf } from '../common/locate';
import { cutPlanText } from '../common/rangePlan';
import { DeleteButton } from './CutButtons';
import { fakeCutLog, locator } from './cutFixtures';
import { beforeCut, CUT_ALREADY, cutCommand, NO_AUDIO, NO_BACKUP, ONLY_SAID, type BeforeCutStep } from './cutCommand';
import { useCutWords, type CutWords } from './useCutWords';

const idle: ScriptPlayback = {
  playing: false,
  follow: true,
  setFollow: () => {},
  toggle: () => {},
  playFrom: () => {},
  playSelection: () => {},
  skip: () => {},
  stop: () => {},
};

let journal: Journal;
let last: 'this' | 'other' | 'unknown';
let log: ReturnType<typeof fakeCutLog>;
let calls: Parameters<DawClient['deleteRange']>[0][];
let undoCalls: Array<[string, number]>;
let undoRefusal: string | null;
let snapMoved: number | 'refused';
let toneRefusal: string | null;
let page: ReturnType<typeof useEditingPage>;
let cut: CutWords;
let doc: ChapterDoc;
let flagDelete: ((keys: string[]) => void) | undefined;
let toast: ReturnType<typeof vi.spyOn>;
let toastUndo: ReturnType<typeof vi.spyOn>;

const alignment: AlignmentPort = {
  heard: () => Promise.reject(new Error('not used')),
  snap: (_c, _g, t) =>
    Promise.resolve(
      snapMoved === 'refused'
        ? { snapped: false, time: t, moved: 0, reason: 'silent', message: 'The audio there is silent.' }
        : { snapped: true, time: t + snapMoved, moved: snapMoved },
    ),
};

function Inner({ list, setList }: { list: EditCut[]; setList: (c: EditCut[]) => void }) {
  page = useEditingPage();
  doc = page.doc;
  cut = useCutWords({ journal, chapterId: 'chapter-1', chapterName: 'Chapter 1', cuts: list, locator, onCuts: setList });
  flagDelete = useFlagActions().deleteWords;
  useEditingKeys({ handlers: { remove: cut.remove, mute: cut.mute }, keymap });
  return <SelectionBar playback={idle} end={60} />;
}
function Harness() {
  const [list, setList] = useState<EditCut[]>([]);
  const d = useMemo(() => marksDoc({ cuts: docCutsOf(list) }), [list]);
  return (
    <EditingPageProvider doc={d}>
      <Inner list={list} setList={setList} />
    </EditingPageProvider>
  );
}

const keymap = defaultKeymap(COMMAND_CATALOG, false);
let press: (code: string) => void;

function mount(setup: DawCapabilities | DawSetupId = 'reaper') {
  const caps = typeof setup === 'string' ? DAW_SETUPS[setup] : setup;
  const base = createMockDawClient(caps);
  const daw: DawClient = {
    ...base,
    undoLast: (action, steps) => (
      undoCalls.push([action, steps]),
      undoRefusal ? Promise.resolve({ ok: false, changed: false, message: undoRefusal, undoSteps: 0, refused: undoRefusal }) : base.undoLast(action, steps)
    ),
    deleteRange: (r) => (
      calls.push(r),
      toneRefusal && r.roomTone ? Promise.resolve({ ok: false, changed: false, message: toneRefusal, undoSteps: 0, refused: toneRefusal }) : base.deleteRange(r)
    ),
  };
  const api = Object.assign(createMockApi(), log);
  let listener: ((e: GestureEvent) => void) | undefined;
  const source: InputSource = {
    subscribe(on) {
      listener = on;
      return () => void (listener = undefined);
    },
  };
  press = (code) => act(() => listener?.({ gesture: gesture('keyboard', code, []), target: null, preventDefault: () => {} }));
  return render(
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw, alignment }}>
        <CommandRouter source={source} keymap={keymap}>
          <CommandScope kind="page">
            <Harness />
          </CommandScope>
        </CommandRouter>
        <OverlayHost />
      </PortOverrides>
    </ApiProvider>,
  );
}
const flush = () => act(async () => {});
const select = async (anchor: string, head: string) => {
  await act(async () => page.dispatch({ type: 'select', anchor, head }));
};
const button = (name: string) => screen.getByRole('button', { name });
const dialog = () => screen.getByRole('dialog');
const enabled = (el: HTMLElement) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';
const confirm = async (name: RegExp) => {
  await waitFor(() => expect(enabled(within(dialog()).getByRole('button', { name }))).toBe(true));
  fireEvent.click(within(dialog()).getByRole('button', { name }));
  await flush();
};
const item = (key: string) => doc.items[doc.index.get(key) ?? -1];
const dialogText = (attr: string) => dialog().querySelector(`[${attr}]`)?.textContent ?? '';

beforeEach(() => {
  last = 'unknown';
  journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => last });
  log = fakeCutLog();
  calls = [];
  undoCalls = [];
  undoRefusal = null;
  snapMoved = 0;
  toneRefusal = null;
  toast = vi.spyOn(overlay, 'toast');
  toastUndo = vi.spyOn(overlay, 'toastUndo');
});
afterEach(() => {
  overlay.getSnapshot().dialogs.forEach((d) => (d.kind === 'confirm' ? d.answer(false) : d.close()));
  overlay.getSnapshot().toasts.forEach((t) => overlay.dismissToast(t.id));
  cleanup();
  vi.restoreAllMocks();
});

describe('Delete words and audio', () => {
  it('asks-first-and-never-cuts-at-once: the bar, the key, the menu and the card open the question; Cancel and Escape change nothing', async () => {
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    fireEvent.click(button('Delete words and audio'));
    expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(calls).toEqual([]);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => cut.remove());
    expect(screen.getByRole('dialog', { name: 'Delete 2 words and their audio?' })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const menu = buildWordMenu({ doc, keys: ['p-1:0'], summary: summarize(doc, ['p-1:0'], [], (t) => t), play: vi.fn(), notify: vi.fn() });
    const items = menu.groups.flat();
    act(() => items.find((i) => i.key === 'cut-delete')!.onSelect());
    expect(screen.getByRole('dialog', { name: 'Delete 1 word and their audio?' })).toBeTruthy();
    act(() => overlay.getSnapshot().dialogs.forEach((d) => d.kind !== 'confirm' && d.close()));
    act(() => flagDelete!(['p-2:0']));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(calls).toEqual([]);
    expect(log.cuts).toEqual([]);
  });

  it('is the mock\'s red text button: "Delete words and audio" in the wide bar, "Delete" in the toolbar and a narrow bar', () => {
    const onClick = vi.fn();
    const { rerender } = render(<DeleteButton onClick={onClick} />);
    const wide = button('Delete words and audio');
    expect(wide.textContent).toBe('Delete words and audio');
    expect(wide.className).toContain('text-[var(--danger-text)]');
    fireEvent.click(wide);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<DeleteButton short separated onClick={onClick} />);
    expect(button('Delete words and audio').textContent).toBe('Delete');
    rerender(<DeleteButton short reason={NO_AUDIO} onClick={onClick} />);
    fireEvent.click(button('Delete words and audio'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button('Delete words and audio').getAttribute('aria-disabled')).toBe('true');
  });

  it('Delete opens the confirmation and never cuts at once; M opens the same question for muting', async () => {
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    press('Delete');
    expect(screen.getByRole('dialog', { name: 'Delete 2 words and their audio?' })).toBeTruthy();
    expect(calls).toEqual([]);
    act(() => overlay.getSnapshot().dialogs.forEach((d) => d.kind !== 'confirm' && d.close()));
    press('KeyM');
    expect(screen.getByRole('dialog', { name: 'Mute 2 words and keep their audio?' })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('dialog-shows-what-will-change: the words, the strips, the range, where they sit, the later audio, the choices and the DAW sentence', async () => {
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    await waitFor(() => expect(dialogText('data-cut-range')).toMatch(/^0:0\d to 0:0\d · 0\.\d s$/));
    expect(dialogText('data-cut-words')).toBe('Alice was');
    expect(dialog().querySelectorAll('[data-cut-strips] svg')).toHaveLength(2);
    expect(dialogText('data-cut-in')).toBe('Chapter 1 · track “Chapter 1”');
    expect(dialogText('data-cut-later')).toMatch(/^moves 0\.\d s earlier in this chapter \(0:0\d becomes 0:0\d\)$/);
    expect(dialogText('data-cut-plan')).toBe(cutPlanText({ kind: 'daw', dawName: 'REAPER' }, false));
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Leave .* of room tone/ }));
    expect(dialogText('data-cut-later')).toMatch(/^does not move; room tone fills 0\.\d s$/);
    expect((within(dialog()).getByRole('combobox', { name: 'Crossfade at the join' }) as HTMLSelectElement).value).toBe('12');
    expect(enabled(within(dialog()).getByRole('checkbox'))).toBe(false);
  });

  it('snapped-ends-are-shown: a moved end is stated, an end on a crossing is not, a refused snap keeps the time and says why', async () => {
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    await waitFor(() => expect(enabled(within(dialog()).getByRole('button', { name: /Delete 2 words/ }))).toBe(true));
    expect(dialog().querySelector('[data-cut-snap]')).toBeNull();
    act(() => overlay.getSnapshot().dialogs.forEach((d) => d.kind !== 'confirm' && d.close()));

    snapMoved = 0.0012;
    act(() => cut.remove());
    await waitFor(() => expect(dialogText('data-cut-snap')).toBe('The start moved 1.2 ms to a zero crossing. The end moved 1.2 ms to a zero crossing.'));
    act(() => overlay.getSnapshot().dialogs.forEach((d) => d.kind !== 'confirm' && d.close()));

    snapMoved = 'refused';
    act(() => cut.remove());
    await waitFor(() => expect(dialogText('data-cut-snap')).toMatch(/^The start was not moved to a zero crossing: The audio there is silent\./));
  });

  it('closing-the-gap-records-and-strikes: one cut in original time, the words struck and kept, later words move up by its length', async () => {
    mount();
    await flush();
    const before = item('p-1:4').t0 as number;
    const [a, b] = [item('p-1:0').t0 as number, item('p-1:1').t1 as number];
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    await confirm(/Delete 2 words and audio/);
    expect(calls).toEqual([{ chapterId: 'chapter-1', firstToken: 0, lastToken: 1, mode: 'close', fadeMs: 12 }]);
    expect(log.cuts).toHaveLength(1);
    expect(log.cuts[0]).toMatchObject({ pid: 'p-1', keys: ['p-1:0', 'p-1:1'], a, b, mode: 'close', fadeMs: 12, daw: 'REAPER', undoSteps: 1 });
    expect(item('p-1:0').cut).toBe('cut1');
    expect(item('p-1:0').text).toBe('Alice');
    expect(item('p-1:4').t0).toBeCloseTo(before - (b - a), 3);
    expect(toastUndo).toHaveBeenCalledWith('Deleted 2 words and their audio in REAPER.', expect.any(Function));
  });

  it('leaving-a-gap-moves-nothing', async () => {
    mount();
    await flush();
    const before = item('p-1:4').t0;
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    await waitFor(() => expect(enabled(within(dialog()).getByRole('button', { name: /Delete 2 words/ }))).toBe(true));
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Leave .* of room tone/ }));
    await confirm(/Delete 2 words and audio/);
    expect(calls[0].mode).toBe('gap');
    expect(log.cuts[0].mode).toBe('gap');
    expect(item('p-1:1').cut).toBe('cut1');
    expect(item('p-1:4').t0).toBe(before);
  });

  it('mute-keeps-the-audio-in-place: M asks the same question for muting and records a gap', async () => {
    mount();
    await flush();
    const before = item('p-1:4').t0;
    await select('p-1:0', 'p-1:1');
    act(() => cut.mute());
    expect(screen.getByRole('dialog', { name: 'Mute 2 words and keep their audio?' })).toBeTruthy();
    expect(within(dialog()).queryByRole('radio')).toBeNull();
    await confirm(/^Mute 2 words$/);
    expect(calls[0].mode).toBe('gap');
    expect(log.cuts[0].mode).toBe('gap');
    expect(item('p-1:4').t0).toBe(before);
    expect((await journal.entries())[0].label).toMatch(/^Muted 2 words at 0:0\d$/);
  });

  it('crossfade-and-pad-reach-the-daw: the chosen fade is in the call', async () => {
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    fireEvent.change(within(dialog()).getByRole('combobox', { name: 'Crossfade at the join' }), { target: { value: '25' } });
    await confirm(/Delete 2 words and audio/);
    expect(calls[0].fadeMs).toBe(25);
    expect(log.cuts[0].fadeMs).toBe(25);
  });

  it('the pad reaches the DAW and cuts less; room tone fills the gap', async () => {
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    await waitFor(() => expect(enabled(within(dialog()).getByRole('button', { name: /Delete 2 words/ }))).toBe(true));
    const whole = dialogText('data-cut-range');
    const full = summarize(doc, ['p-1:0', 'p-1:1'], [], (t) => t).len;
    const pad = within(dialog()).getByRole('combobox', { name: 'Keep audio at each edge of the cut' });
    expect(enabled(pad)).toBe(true);
    fireEvent.change(pad, { target: { value: '100' } });
    await waitFor(() => expect(dialogText('data-cut-range')).not.toBe(whole));
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Leave .* of room tone/ }));
    await confirm(/Delete 2 words and audio/);
    expect(calls).toEqual([{ chapterId: 'chapter-1', firstToken: 0, lastToken: 1, mode: 'gap', fadeMs: 12, padMs: 100, roomTone: true }]);
    const [rec] = log.cuts;
    expect(rec.b - rec.a).toBeCloseTo(full - 0.2, 2);
    expect(rec.mode).toBe('gap');
  });

  it('a DAW that refuses room tone says why and the cut leaves silence', async () => {
    const why = 'This chapter has no room tone marked in REAPER. Mark a stretch of room tone on its track with a region named Room tone.';
    toneRefusal = why;
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    await waitFor(() => expect(enabled(within(dialog()).getByRole('button', { name: /Delete 2 words/ }))).toBe(true));
    fireEvent.click(within(dialog()).getByRole('radio', { name: /Leave .* of room tone/ }));
    await confirm(/Delete 2 words and audio/);
    expect(calls.map((c) => c.roomTone ?? false)).toEqual([true, false]);
    expect(log.cuts).toHaveLength(1);
    expect(log.cuts[0].mode).toBe('gap');
    const [said] = toastUndo.mock.calls[0];
    expect(said).toContain(why);
    expect(said).toContain('The gap is silent');
  });

  it('one-undo-step-named-and-a-daw-change: two paragraphs are two DAW calls and one entry; Undo puts them back; a later change refuses', async () => {
    mount();
    await flush();
    const before = doc.items.map((i) => i.t0);
    await select('p-1:7', 'p-2:1');
    act(() => cut.remove());
    await confirm(/Delete \d words and audio/);
    expect(calls.map((c) => [c.firstToken, c.lastToken])).toEqual([
      [7, 8],
      [100, 101],
    ]);
    const rows = await journal.entries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: expect.stringMatching(/^Deleted \d words and their audio at 0:0\d$/), daw: true });
    expect(log.cuts).toHaveLength(2);

    last = 'this';
    await act(async () => void (await journal.undo(1)));
    expect(log.cuts).toEqual([]);
    expect(doc.items.map((i) => i.t0)).toEqual(before);
    expect(item('p-2:0').cut).toBeUndefined();

    await select('p-1:0', 'p-1:0');
    act(() => cut.remove());
    await confirm(/Delete 1 word and audio/);
    await journal.act({
      label: 'Added a bookmark',
      touches: ['bookmarks/1'],
      run: async () => ({ ok: true, value: 1 }),
      undo: async () => ({ ok: true, value: 1 }),
    });
    const undone = await journal.undo(2);
    expect(undone).toMatchObject({ ok: false, refusal: { reason: "Undo 'Added a bookmark' first. It came after this." } });
  });

  it('undo-takes-the-cut-back-in-the-daw-first: one undo point for each range, and a DAW that refuses keeps the entry and the records', async () => {
    mount();
    await flush();
    await select('p-1:7', 'p-2:1');
    act(() => cut.remove());
    await confirm(/Delete \d words and audio/);
    expect(log.cuts).toHaveLength(2);

    last = 'this';
    undoRefusal = "REAPER's last action is not this one, so it was left alone. Use Edit > Undo in REAPER.";
    expect(await journal.undo(1)).toMatchObject({ ok: false, refusal: { reason: undoRefusal } });
    expect(undoCalls).toEqual([['cut_range', 2]]);
    expect(log.cuts).toHaveLength(2);
    expect(await journal.entries()).toHaveLength(1);

    undoRefusal = null;
    await act(async () => void (await journal.undo(1)));
    expect(undoCalls).toEqual([
      ['cut_range', 2],
      ['cut_range', 2],
    ]);
    expect(log.cuts).toEqual([]);
  });

  it('a cut the built-in recorder made is not a DAW change: undo asks the DAW nothing', async () => {
    mount('builtin');
    await flush();
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    await confirm(/Delete 2 words and audio/);
    await act(async () => void (await journal.undo(1)));
    expect(undoCalls).toEqual([]);
    expect(log.cuts).toEqual([]);
  });

  it('restore-brings-struck-words-back-or-says-why-not', async () => {
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    await confirm(/Delete 2 words and audio/);
    expect(button('Restore these words')).toBeTruthy();

    // REAPER cannot say its last action is this cut: undo it there, then forget the record.
    await act(async () => cut.restore(['p-1:0']));
    expect(toast).toHaveBeenLastCalledWith('Undo it in REAPER (Edit > Undo). The app can only undo what it did this session.', expect.anything());
    expect(log.cuts).toHaveLength(1);
    const forget = toast.mock.lastCall![1] as { action: { label: string; onAction: () => void } };
    expect(forget.action.label).toBe('Forget the cut');
    await act(async () => forget.action.onAction());
    expect(log.cuts).toEqual([]);
    expect(item('p-1:0').cut).toBeUndefined();

    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    await confirm(/Delete 2 words and audio/);
    last = 'this';
    fireEvent.click(button('Restore these words'));
    await flush();
    expect(toast).toHaveBeenLastCalledWith('Restored the words and their audio.');
    expect(item('p-1:0').cut).toBeUndefined();

    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    await confirm(/Delete 2 words and audio/);
    await journal.act({ label: 'Kept T-2', touches: ['takes/x'], daw: true, run: async () => ({ ok: true, value: 1 }) });
    await act(async () => cut.restore(['p-1:0']));
    expect(toast).toHaveBeenLastCalledWith("Undo 'Kept T-2' first. It came after this.", { tone: 'error' });
    expect(log.cuts).toHaveLength(1);
  });

  it('a-daw-refusal-changes-nothing: capability off, a stale range and Audacity without backups say the DAW sentence and record nothing', async () => {
    mount('reaper-off');
    await flush();
    await select('p-1:0', 'p-1:1');
    const sentence = DAW_SETUPS['reaper-off'].capabilities.cut_range!.message!;
    expect(button('Delete words and audio').getAttribute('aria-description')).toBe(`Delete words and audio (Del) — ${sentence}`);
    act(() => cut.remove());
    expect(toast).toHaveBeenLastCalledWith(sentence, { tone: 'error' });
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();

    mount('audacity');
    await flush();
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    expect(toast).toHaveBeenLastCalledWith(DAW_SETUPS.audacity.capabilities.cut_range!.message, { tone: 'error' });
    cleanup();

    mount('reaper');
    await flush();
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    await waitFor(() => expect(enabled(within(dialog()).getByRole('button', { name: /Delete 2 words/ }))).toBe(true));
    // The DAW no longer has this chapter: refused with code stale.
    vi.spyOn(locator, 'token').mockReturnValue(-1);
    await confirm(/Delete 2 words and audio/);
    expect(toast).toHaveBeenLastCalledWith(expect.stringMatching(/not in this chapter's alignment any more/), { tone: 'error' });
    expect(log.cuts).toEqual([]);
    expect(await journal.entries()).toEqual([]);
  });

  it('words-with-no-audio-or-already-cut-are-not-offered, and low-confidence words are named', async () => {
    mount();
    await flush();
    await select('p-1:2', 'p-1:2');
    expect(button('Delete words and audio').getAttribute('aria-description')).toBe(`Delete words and audio (Del) — ${NO_AUDIO}`);
    await select('p-1:3', 'p-1:4');
    act(() => cut.remove());
    await waitFor(() => expect(dialogText('data-cut-low')).toBe('Includes 1 low-confidence word: “tired”.'));
    await confirm(/Delete 2 words and audio/);
    act(() => cut.ask(['p-1:3'], false));
    expect(toast).toHaveBeenLastCalledWith(CUT_ALREADY, { tone: 'error' });
    await select('p-1:3', 'p-1:4');
    expect(screen.queryByRole('button', { name: 'Delete words and audio' })).toBeNull();
  });

  it('built-in-recorder-variant: the app makes the change itself, through the recorder, and Undo here takes it back', async () => {
    const recorder: DawCapabilities = {
      ...DAW_SETUPS.builtin,
      capabilities: { ...DAW_SETUPS.builtin.capabilities, cut_range: { level: 'experimental', available: true, mode: 'app' } },
    };
    mount(recorder);
    await flush();
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    expect(dialogText('data-cut-plan')).toBe(cutPlanText({ kind: 'recorder', dawName: 'the built-in recorder' }, false));
    expect(dialogText('data-cut-plan')).toMatch(/^The app makes this change itself/);
    await confirm(/Delete 2 words and audio/);
    expect(calls).toHaveLength(1);
    expect(log.cuts[0]).toMatchObject({ daw: 'the built-in recorder', undoSteps: 0 });
    const [row] = await journal.entries();
    expect(row).toMatchObject({ daw: false, refusal: null });
    await act(async () => void (await journal.undo(row.id)));
    expect(log.cuts).toEqual([]);
  });

  it('a DAW that changes the audio runs the steps before the cut first, and without one the cut is refused with nothing changed', async () => {
    const sum = summarize(marksDoc(), ['p-1:0', 'p-1:1'], [], (t) => t);
    const order: string[] = [];
    const deps = {
      daw: {
        deleteRange: async () => (order.push('cut'), { ok: true, changed: true, message: 'Cut.', undoSteps: 2 }),
        undoLast: async () => ({ ok: true, changed: true, message: 'Undid.', undoSteps: 0 }),
      },
      log,
      onCuts: () => {},
    };
    const plan = { kind: 'backup-then-daw', dawName: 'Audacity', steps: 2 } as const;
    const ask = { chapterId: 'chapter-1', summary: sum, options: { mode: 'close', fadeMs: 12 }, mute: false, locator } as const;
    expect(await cutCommand(deps, plan, ask).run()).toMatchObject({ ok: false, refusal: { reason: NO_BACKUP } });
    expect(order).toEqual([]);
    const step: BeforeCutStep = { name: 'backup', run: async () => (order.push('backup'), { ok: true, value: 'bk1' }) };
    beforeCut.push(step);
    try {
      expect((await cutCommand(deps, plan, ask).run()).ok).toBe(true);
    } finally {
      beforeCut.splice(beforeCut.indexOf(step), 1);
    }
    expect(order).toEqual(['backup', 'cut']);
  });

  it('words said and not in the script alone are not offered: the DAW names words by their tokens', async () => {
    mount();
    await flush();
    const um = doc.items.find((i) => i.kind === 'x')!.key;
    await select(um, um);
    expect(button('Delete words and audio').getAttribute('aria-description')).toBe(`Delete words and audio (Del) — ${ONLY_SAID}`);
  });

  it('atlas-and-axe: the dialog is named by its question and Cancel comes first in focus order', async () => {
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    act(() => cut.remove());
    const d = screen.getByRole('dialog', { name: 'Delete 2 words and their audio?' });
    const buttons = within(d).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(expect.arrayContaining(['Cancel', 'Delete 2 words and audio']));
    expect(document.activeElement).toBe(within(d).getByRole('button', { name: 'Cancel' }));
  });
});
