// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DawResult } from '../../../../api/contracts/daw';
import type { Narrator, ReplaceAnswer, ReplacePlan, Replacement, ReplaceAudioApi } from '../../../../api/contracts/replace';
import { ReplaceDialog } from './ReplaceDialog';
import { ReplacementMark } from './ReplacementMark';
import { ReplacementMarksContext } from './replacementMarks';
import { REPLACE_KIND, replaceCommand, replaceLabel, type ReplaceAsk } from './replaceCommand';
import { replaceRefusal } from './useReplaceAudio';
import type { SelSummary } from '../../model';
import type { RangeLocator } from '../common/locate';

afterEach(cleanup);

const ok = (message: string, undoSteps = 1): DawResult => ({ ok: true, changed: true, message, undoSteps });
const refused = (message: string): DawResult => ({ ok: false, changed: false, message, undoSteps: 0, refused: message });

const replacement: Replacement = {
  id: 'r-0001',
  chapterId: 'c-1',
  keys: ['p-1:4', 'p-1:5', 'p-1:6'],
  words: ['the', 'Queen', 'shouted.'],
  start: 12,
  end: 14,
  narratorId: 'n-1',
  narratorName: 'Eric Leach',
  fileId: 'f-1',
  sourceStart: 164.2,
  sourceEnd: 167.2,
  gainDb: 3.4,
  measuredLufs: -23.4,
  targetLufs: -20,
  fadeMs: 10,
  shift: 1,
  daw: 'REAPER',
  undoSteps: 1,
  at: '2026-10-25T00:00:00Z',
  restoredAt: null,
  active: true,
  paragraph: 0,
  stale: false,
};

const ask: ReplaceAsk = {
  chapterId: 'c-1',
  firstToken: 4,
  lastToken: 6,
  words: 3,
  start: 54.3,
  narrator: 'Eric Leach',
  fileId: 'f-1',
  sourceStart: 164.2,
  sourceEnd: 167.2,
  fadeMs: 10,
  gainDb: 3.4,
};

const answer = (result: DawResult, list: Replacement[] = [replacement]): ReplaceAnswer => ({
  result,
  replacementId: result.ok ? 'r-0001' : '',
  replacements: { chapterId: 'c-1', replacements: list },
});

describe('replaceCommand', () => {
  it('replaces through the host, names the entry, and undoes the one DAW point before forgetting the record', async () => {
    const calls: string[] = [];
    const onReplacements = vi.fn();
    const deps = {
      api: {
        dawReplaceRange: vi.fn(async () => answer(ok("Replaced 3 words with Eric Leach's audio in REAPER."))),
        editingReplacementRemove: vi.fn(async () => {
          calls.push('forget');
          return { chapterId: 'c-1', replacements: [], changed: ['r-0001'] };
        }),
      },
      daw: {
        undoLast: vi.fn(async (kind: string, steps: number) => {
          calls.push(`undo ${kind} ${steps}`);
          return ok('Undid the replacement in REAPER.', 0);
        }),
      },
      onReplacements,
    };
    const command = replaceCommand(deps, ask);
    expect(command.label).toBe("Replaced 3 words with Eric Leach's audio at 0:54");
    expect(command.daw).toBe(true);
    const run = await command.run();
    expect(run).toEqual({ ok: true, value: { id: 'r-0001', message: "Replaced 3 words with Eric Leach's audio in REAPER.", undoSteps: 1 } });
    expect(deps.api.dawReplaceRange).toHaveBeenCalledWith('c-1', 4, 6, 'f-1', 164.2, 167.2, 10, 3.4);
    expect(onReplacements).toHaveBeenLastCalledWith([replacement]);
    expect(command.dawAction?.({ id: 'r-0001', message: '', undoSteps: 1 })).toEqual({ kind: REPLACE_KIND, steps: 1 });
    expect(command.dawAction?.({ id: 'r-0001', message: '', undoSteps: 0 })).toBeUndefined();
    const undone = await command.undo?.({ id: 'r-0001', message: '', undoSteps: 1 });
    expect(undone?.ok).toBe(true);
    expect(calls).toEqual(['undo replace_range 1', 'forget']);
    expect(onReplacements).toHaveBeenLastCalledWith([]);
  });

  it("passes the DAW's refusal on, records nothing, and keeps the record when the DAW will not undo", async () => {
    const deps = {
      api: {
        dawReplaceRange: vi.fn(async () => answer(refused('Some of these words are already replaced. Put your audio back first.'), [])),
        editingReplacementRemove: vi.fn(),
      },
      daw: { undoLast: vi.fn(async () => refused("REAPER's last action is not this one, so it was left alone. Use Edit > Undo in REAPER.")) },
      onReplacements: vi.fn(),
    };
    const command = replaceCommand(deps, ask);
    expect(await command.run()).toEqual({
      ok: false,
      refusal: { code: 'daw_refused', reason: 'Some of these words are already replaced. Put your audio back first.' },
    });
    expect(deps.onReplacements).not.toHaveBeenCalled();
    const undone = await command.undo?.({ id: 'r-0001', message: '', undoSteps: 1 });
    expect(undone?.ok).toBe(false);
    expect(deps.api.editingReplacementRemove).not.toHaveBeenCalled();
    deps.api.dawReplaceRange.mockRejectedValueOnce(new Error('the host is gone'));
    expect(await command.run()).toEqual({ ok: false, refusal: { code: 'host_refused', reason: 'the host is gone' } });
  });

  it('names one word and several', () => {
    expect(replaceLabel(1, 'إريك 🎙', 3)).toBe("Replaced 1 word with إريك 🎙's audio at 0:03");
  });
});

describe('replaceRefusal', () => {
  const locator = { token: (k: string) => (k.startsWith('p-') ? 1 : undefined) } as unknown as RangeLocator;
  const sum = (over: Partial<SelSummary>): SelSummary =>
    ({ audible: [{ key: 'p-1:4' }], hasCut: false, ranges: [{ keys: ['p-1:4'] }], ...over }) as unknown as SelSummary;
  it('says why, in the order the narrator can act on it', () => {
    expect(replaceRefusal(null, sum({}), locator, new Set())).toBe('Checking what the DAW can do.');
    expect(replaceRefusal({ ok: false, reason: 'Experimental: switched off in Settings.' }, sum({}), locator, new Set())).toBe(
      'Experimental: switched off in Settings.',
    );
    expect(replaceRefusal({ ok: true }, sum({ hasCut: true }), locator, new Set())).toBe('Some of these words are cut. Restore them first.');
    expect(replaceRefusal({ ok: true }, sum({ audible: [] }), locator, new Set())).toBe('There is no audio for these words.');
    expect(replaceRefusal({ ok: true }, sum({ ranges: [{ keys: ['x-1'] }] as never }), locator, new Set())).toContain('Only words of the script');
    expect(replaceRefusal({ ok: true }, sum({}), locator, new Set(['p-1:4']))).toBe('Some of these words are already replaced. Put your audio back first.');
    expect(replaceRefusal({ ok: true }, sum({}), locator, new Set())).toBe('');
  });
});

type DialogApi = Pick<ReplaceAudioApi, 'replaceNarrators' | 'replaceNarratorAdd' | 'replaceAddFile' | 'replaceFilePeaks' | 'replacePlan'>;

function dialogApi(start: Narrator[], plan: Partial<ReplacePlan> = {}): DialogApi & { narrators: Narrator[] } {
  const state = { narrators: start };
  const full: ReplacePlan = {
    result: { ok: true, changed: false, message: '', undoSteps: 0 },
    narrator: 'Eric Leach',
    words: 3,
    start: 12,
    end: 14,
    sourceStart: 0,
    sourceEnd: 2,
    shift: 0,
    measuredLufs: -23.4,
    targetLufs: -20,
    gainDb: 3.4,
    clamped: false,
    loudnessNote: '',
    ...plan,
  };
  return {
    get narrators() {
      return state.narrators;
    },
    replaceNarrators: async () => ({ narrators: state.narrators }),
    replaceNarratorAdd: async (name) => {
      state.narrators = [...state.narrators, { id: `n-${state.narrators.length + 1}`, name, addedAt: '', files: [] }];
      return { narrators: state.narrators, changed: [`n-${state.narrators.length}`] };
    },
    replaceAddFile: async (id) => {
      state.narrators = state.narrators.map((n) =>
        n.id === id ? { ...n, files: [{ id: 'f-1', name: 'Eric Leach - Chapter 1.mp3', size: 1, length: 796.5, daw: 'REAPER', addedAt: '', state: 'ok' }] } : n,
      );
      return { result: ok("Added Eric Leach's audio to REAPER on a muted track of its own."), fileId: 'f-1', narrators: { narrators: state.narrators } };
    },
    replaceFilePeaks: async (fileId) => ({ fileId, length: 796.5, reason: 'no waveform' }),
    replacePlan: async (_c, _f, _l, _file, sourceStart, sourceEnd) => ({ ...full, sourceStart, sourceEnd, shift: sourceEnd - sourceStart - 2 }),
  };
}

function renderDialog(api: DialogApi, onConfirm = vi.fn()) {
  render(
    <ReplaceDialog
      api={api}
      chapterId="c-1"
      firstToken={4}
      lastToken={6}
      text="the Queen shouted."
      words={3}
      start={12}
      end={14}
      dawName="REAPER"
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe('ReplaceDialog', () => {
  it('asks for the other narrator once, brings their file in, plans the stretch and replaces with the level the host proposes', async () => {
    const api = dialogApi([]);
    const onConfirm = renderDialog(api);
    await screen.findByText(/Name the other narrator once for this project/);
    const replace = screen.getByRole<HTMLButtonElement>('button', { name: 'Replace 3 words' });
    expect(replace.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Name another narrator'), { target: { value: 'Eric Leach' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByLabelText('Other narrator');
    fireEvent.click(screen.getByRole('button', { name: 'Add a file of theirs…' }));
    await screen.findByText("Added Eric Leach's audio to REAPER on a muted track of its own.");
    await waitFor(() => expect(screen.getByText(/Theirs -23.4 LUFS · target -20 LUFS/)).toBeTruthy(), { timeout: 2000 });
    expect(screen.getByText(/Yours 2.00 s · theirs 2.00 s. The later audio stays where it is./)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('To (seconds)'), { target: { value: '3' } });
    await waitFor(() => expect(screen.getByText(/The later audio on this track moves 1.00 s later./)).toBeTruthy(), { timeout: 2000 });
    await waitFor(() => expect(replace.disabled).toBe(false));
    fireEvent.click(replace);
    expect(onConfirm).toHaveBeenCalledWith({
      chapterId: 'c-1',
      firstToken: 4,
      lastToken: 6,
      words: 3,
      start: 12,
      narrator: 'Eric Leach',
      fileId: 'f-1',
      sourceStart: 0,
      sourceEnd: 3,
      fadeMs: 10,
      gainDb: 3.4,
    });
  });

  it("shows the host's refusal and why the level was not measured, and keeps Replace off", async () => {
    const narrators: Narrator[] = [
      { id: 'n-1', name: 'Eric Leach', addedAt: '', files: [{ id: 'f-1', name: 'leach.mp3', size: 1, length: 60, daw: 'REAPER', addedAt: '', state: 'ok' }] },
    ];
    const api = dialogApi(narrators, {
      result: refused('Some of these words are already replaced. Put your audio back first.'),
      measuredLufs: null,
      gainDb: 0,
    });
    renderDialog(api);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('already replaced'), { timeout: 2000 });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Replace 3 words' }).disabled).toBe(true);
  });

  it('warns when their file moved and keeps Replace off', async () => {
    const narrators: Narrator[] = [
      {
        id: 'n-1',
        name: 'Eric Leach',
        addedAt: '',
        files: [{ id: 'f-1', name: 'leach.mp3', size: 1, length: 60, daw: 'REAPER', addedAt: '', state: 'missing' }],
      },
    ];
    renderDialog(dialogApi(narrators));
    await screen.findByText(/leach.mp3 is no longer where it was added/);
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Replace 3 words' }).disabled).toBe(true);
  });
});

describe('ReplacementMark', () => {
  it("names the other narrator after the stretch and puts the narrator's audio back", async () => {
    const restore = vi.fn(async () => undefined);
    render(
      <ReplacementMarksContext.Provider value={{ at: new Map([['p-1:6', replacement]]), keysOf: new Set(replacement.keys), restore }}>
        <ReplacementMark wordKey="p-1:6" />
        <ReplacementMark wordKey="p-1:5" />
      </ReplacementMarksContext.Provider>,
    );
    const mark = screen.getByRole('button', { name: /Eric Leach's audio plays for the 3 words before/ });
    expect(mark.textContent).toBe('Eric Leach');
    expect(document.querySelectorAll('[data-replacement-mark]')).toHaveLength(1);
    fireEvent.click(mark);
    const back = await screen.findByRole('button', { name: 'Put my audio back' });
    expect(screen.getByText(/\+3.4 dB \(from -23.4 to -20 LUFS\)/)).toBeTruthy();
    fireEvent.click(back);
    expect(restore).toHaveBeenCalledWith(replacement);
  });
});
