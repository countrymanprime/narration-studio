// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import type { DawResult } from '../../../../api/contracts/daw';
import type { Narrator, Replacement, ReplaceAudioApi } from '../../../../api/contracts/replace';
import { createMockApi } from '../../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../../fixtures/daw';
import { OverlayHost } from '../../../../overlay/OverlayHost';
import { overlay } from '../../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../../ports/daw';
import { PortOverrides } from '../../../../ports/usePort';
import { createJournal, type Journal } from '../../../../studio/journal/createJournal';
import { SelectionBar } from '../../bar/SelectionBar';
import type { ScriptPlayback } from '../../bar/useScriptPlayback';
import { buildWordMenu } from '../../menu/wordMenuRegistry';
import { summarize } from '../../model';
import { EditingPageProvider, useEditingPage } from '../../script/EditingPageState';
import { marksDoc } from '../../script/scriptFixtures';
import { locator } from '../cut/cutFixtures';
import type { ReplacementMarks } from './replacementMarks';
import { useReplaceAudio } from './useReplaceAudio';

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
const ok = (message: string, undoSteps = 1): DawResult => ({ ok: true, changed: true, message, undoSteps });
const refused = (message: string): DawResult => ({ ok: false, changed: false, message, undoSteps: 0, refused: message });

let journal: Journal;
let page: ReturnType<typeof useEditingPage>;
let marks: ReplacementMarks;
let undoCalls: Array<[string, number]>;
let replacements: Replacement[];
let restoreAnswer: DawResult;

const narrators: Narrator[] = [
  { id: 'n-1', name: 'Eric Leach', addedAt: '', files: [{ id: 'f-1', name: 'leach.wav', size: 1, length: 60, daw: 'REAPER', addedAt: '', state: 'ok' }] },
];

function fakeApi(): ReplaceAudioApi {
  const list = () => ({ chapterId: 'chapter-1', replacements: replacements.map((r) => ({ ...r })) });
  return {
    replaceNarrators: async () => ({ narrators }),
    replaceNarratorAdd: async () => ({ narrators, changed: [] }),
    replaceNarratorRemove: async () => ({ narrators, changed: [] }),
    replaceAddFile: async () => ({ result: ok(''), fileId: '', narrators: { narrators } }),
    replaceFilePeaks: async (fileId) => ({ fileId, length: 60, reason: 'no waveform' }),
    replacePlan: async (_c, first, last, _f, sourceStart, sourceEnd) => ({
      result: { ok: true, changed: false, message: '', undoSteps: 0 },
      narrator: 'Eric Leach',
      words: last - first + 1,
      start: 0,
      end: 1,
      sourceStart,
      sourceEnd,
      shift: 0,
      measuredLufs: -22,
      targetLufs: -20,
      gainDb: 2,
      clamped: false,
      loudnessNote: '',
    }),
    dawReplaceRange: async (chapterId, first, last, fileId, sourceStart, sourceEnd, fadeMs, gainDb) => {
      const keys = Array.from({ length: last - first + 1 }, (_, i) => `p-1:${first + i}`);
      replacements.push({
        id: `r-${replacements.length + 1}`,
        chapterId,
        keys,
        words: keys.map(() => 'w'),
        start: 0,
        end: 1,
        narratorId: 'n-1',
        narratorName: 'Eric Leach',
        fileId,
        sourceStart,
        sourceEnd,
        gainDb,
        measuredLufs: -22,
        targetLufs: -20,
        fadeMs,
        shift: 0,
        daw: 'REAPER',
        undoSteps: 1,
        at: '',
        restoredAt: null,
        active: true,
        paragraph: 0,
        stale: false,
      });
      return {
        result: ok(`Replaced ${keys.length} words with Eric Leach's audio in REAPER.`),
        replacementId: `r-${replacements.length}`,
        replacements: list(),
      };
    },
    dawRestoreReplacement: async (_c, id) => {
      if (restoreAnswer.ok) replacements = replacements.map((r) => (r.id === id ? { ...r, active: false, restoredAt: 'now' } : r));
      return { result: restoreAnswer, replacementId: id, replacements: list() };
    },
    editingReplacementsList: async () => list(),
    editingReplacementRemove: async (_c, id) => {
      replacements = replacements.filter((r) => r.id !== id);
      return { ...list(), changed: [id] };
    },
  };
}

function Inner() {
  page = useEditingPage();
  marks = useReplaceAudio({ journal, chapterId: 'chapter-1', locator });
  return <SelectionBar playback={idle} end={60} />;
}

function mount(setup: DawSetupId = 'reaper') {
  const base = createMockDawClient(DAW_SETUPS[setup]);
  // The fake host above records no DAW history, so the DAW's undo answers as REAPER would for the replacement it just made.
  const daw: DawClient = { ...base, undoLast: async (action, steps) => (undoCalls.push([action, steps]), ok('Undid the replacement in REAPER.', 0)) };
  return render(
    <ApiProvider api={Object.assign(createMockApi(), fakeApi())}>
      <PortOverrides clients={{ daw }}>
        <EditingPageProvider doc={marksDoc()}>
          <Inner />
        </EditingPageProvider>
        <OverlayHost />
      </PortOverrides>
    </ApiProvider>,
  );
}
const flush = () => act(async () => {});
const select = async (anchor: string, head: string) => {
  await act(async () => page.dispatch({ type: 'select', anchor, head }));
};
const action = (name: string) => screen.getByRole('button', { name });
const menuItems = (key: string) =>
  buildWordMenu({ doc: page.doc, keys: [key], summary: summarize(page.doc, [key], [], (t) => t), play: vi.fn(), notify: vi.fn() }).groups.flat();

beforeEach(() => {
  journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });
  undoCalls = [];
  replacements = [];
  restoreAnswer = ok("Put your audio back in place of Eric Leach's in REAPER.");
});
afterEach(() => {
  overlay.getSnapshot().dialogs.forEach((d) => (d.kind === 'confirm' ? d.answer(false) : d.close()));
  overlay.getSnapshot().toasts.forEach((t) => overlay.dismissToast(t.id));
  cleanup();
  vi.restoreAllMocks();
});

describe("Replace with another narrator's audio", () => {
  it('opens the question from the bar, replaces on confirm, marks the stretch with their name, and Undo takes the one DAW point back', async () => {
    const toastUndo = vi.spyOn(overlay, 'toastUndo');
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    await waitFor(() => expect((action("Replace with another narrator's audio") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(action("Replace with another narrator's audio"));
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    const go = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Replace 2 words' });
    await waitFor(() => expect(go.disabled).toBe(false), { timeout: 2000 });
    fireEvent.click(go);
    await waitFor(() => expect(toastUndo).toHaveBeenCalled());
    expect(toastUndo.mock.calls[0]?.[0]).toBe("Replaced 2 words with Eric Leach's audio in REAPER.");
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(marks.at.get('p-1:1')?.narratorName).toBe('Eric Leach');
    expect([...marks.keysOf]).toEqual(['p-1:0', 'p-1:1']);

    // The replaced words offer Put my audio back, in the bar and the word menu, and refuse a second replacement.
    await waitFor(() => expect(action('Put my audio back')).toBeTruthy());
    expect(menuItems('p-1:0').map((i) => i.label)).toContain("Put my audio back (now Eric Leach's)");

    const entry = toastUndo.mock.calls[0]?.[2]?.entry as number;
    let undone: unknown;
    await act(async () => void (undone = await journal.undo(entry)));
    expect(undone).toMatchObject({ ok: true });
    expect(undoCalls).toEqual([['replace_range', 1]]);
    expect(replacements).toEqual([]);
    await waitFor(() => expect(marks.at.size).toBe(0));
  });

  it('Put my audio back marks the replacement put back; a refusal keeps it and says why', async () => {
    const toast = vi.spyOn(overlay, 'toast');
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    await waitFor(() => expect((action("Replace with another narrator's audio") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(action("Replace with another narrator's audio"));
    const go = within(screen.getByRole('dialog')).getByRole<HTMLButtonElement>('button', { name: 'Replace 2 words' });
    await waitFor(() => expect(go.disabled).toBe(false), { timeout: 2000 });
    fireEvent.click(go);
    await waitFor(() => expect(marks.at.size).toBe(1));

    restoreAnswer = refused('REAPER is not answering.');
    await act(async () => void (await marks.restore(replacements[0]!)));
    expect(toast).toHaveBeenLastCalledWith('REAPER is not answering.', { tone: 'error' });
    expect(marks.at.size).toBe(1);

    restoreAnswer = ok("Put your audio back in place of Eric Leach's in REAPER.");
    act(() =>
      menuItems('p-1:0')
        .find((i) => i.key === 'replace-restore')!
        .onSelect(),
    );
    await waitFor(() => expect(marks.at.size).toBe(0));
    expect(toast).toHaveBeenLastCalledWith("Put your audio back in place of Eric Leach's in REAPER.");
    expect(menuItems('p-1:0').map((i) => i.label)).toContain("Replace with another narrator's audio…");
  });

  it('is off, with the reason, when REAPER is not answering', async () => {
    mount('reaper-off');
    await flush();
    await select('p-1:0', 'p-1:1');
    await waitFor(() => expect(menuItems('p-1:0').find((i) => i.key === 'replace-audio')?.unavailable).toContain('REAPER is not answering'));
    fireEvent.click(action("Replace with another narrator's audio"));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
