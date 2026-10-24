// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { DAW_CHOSEN_CHAIN, type DawFxRangeChoice, type DawResult } from '../../../../api/contracts/daw';
import type { WordFx } from '../../../../api/contracts/wordFx';
import { createMockApi } from '../../../../api/mockApi';
import { DAW_SETUPS, FX_CHOSEN } from '../../../../fixtures/daw';
import { OverlayHost } from '../../../../overlay/OverlayHost';
import { overlay } from '../../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../../ports/daw';
import { PortOverrides } from '../../../../ports/usePort';
import { createJournal, type Journal } from '../../../../studio/journal/createJournal';
import { summarize } from '../../model';
import { EditingPageProvider, useEditingPage } from '../../script/EditingPageState';
import { marksDoc } from '../../script/scriptFixtures';
import { locator } from '../cut/cutFixtures';
import { CHOSEN_NOT_REAPPLIED, FX_FADE_MS, removeFxCommand } from './fxCommand';
import { fakeFxLog } from './fxFixtures';
import { NOTHING_CHOSEN } from './useChooseInDaw';
import { useFxWords, type FxWords } from './useFxWords';

// Choose in the DAW (#2251) through useFxWords: the DAW's own FX window opened for the words, the choice followed, kept as one history entry
// or cancelled. The DAW is the mock client with its answers counted or replaced.

let journal: Journal;
let log: ReturnType<typeof fakeFxLog>;
let fx: FxWords;
let page: ReturnType<typeof useEditingPage>;
let chose: Parameters<DawClient['chooseFxForRange']>[0][];
let reads: number;
let removed: Parameters<DawClient['removeFxFromRange']>[0][];
let toast: ReturnType<typeof vi.spyOn>;
let toastUndo: ReturnType<typeof vi.spyOn>;

function Inner() {
  const [effects, setEffects] = useState<WordFx[]>([]);
  page = useEditingPage();
  fx = useFxWords({ journal, chapterId: 'chapter-1', chapterName: 'Chapter 1', effects, cuts: [], locator, onEffects: setEffects });
  return null;
}

function mount(over: Partial<DawClient> = {}) {
  const base = createMockDawClient(DAW_SETUPS.reaper);
  const daw: DawClient = {
    ...base,
    chooseFxForRange: (r) => (chose.push(r), base.chooseFxForRange(r)),
    chosenFxForRange: (t) => (reads++, base.chosenFxForRange(t)),
    removeFxFromRange: (r) => (removed.push(r), base.removeFxFromRange(r)),
    ...over,
  };
  return render(
    <ApiProvider api={Object.assign(createMockApi(), log)}>
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
const start = async (keys: string[] = ['p-1:0', 'p-1:1']) => {
  await flush();
  await act(async () => fx.chooser.start(summarize(page.doc, keys, [], (t) => t)));
  await flush();
};
const open = (choice: Partial<DawFxRangeChoice> = {}): DawFxRangeChoice => ({ ...FX_CHOSEN, ...choice });

beforeEach(() => {
  journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });
  log = fakeFxLog();
  chose = [];
  reads = 0;
  removed = [];
  toast = vi.spyOn(overlay, 'toast');
  toastUndo = vi.spyOn(overlay, 'toastUndo');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Choose in the DAW', () => {
  it('opens the DAW’s FX window for the words with the fade, and keeps what was chosen once the window is closed, as one undo', async () => {
    mount({ chosenFxForRange: async () => (reads++, { ...FX_CHOSEN, chainOpen: false }) });
    await start();
    expect(chose).toEqual([{ chapterId: 'chapter-1', firstToken: expect.any(Number), lastToken: expect.any(Number), fadeMs: FX_FADE_MS }]);
    await waitFor(() => expect(log.recorded).toHaveLength(1));
    expect(log.recorded[0]).toMatchObject({ chainId: DAW_CHOSEN_CHAIN, chainName: 'ReaComp (Cockos)', source: 'Chosen in REAPER', daw: 'REAPER' });
    expect(log.recorded[0].guid).toContain(DAW_CHOSEN_CHAIN);
    expect(fx.chooser.state.phase).toBe('idle');
    expect(toastUndo.mock.calls[0][0]).toBe('Added ReaComp (Cockos) to the words in REAPER.');
    const entry = (await journal.entries())[0];
    await act(async () => void (await journal.undo(entry.id)));
    expect(removed.at(-1)).toMatchObject({ chainName: DAW_CHOSEN_CHAIN });
    expect(log.effects).toHaveLength(0);
  });

  it('while the window is open and nothing is chosen, Keep it says so and Cancel joins the words back without recording', async () => {
    mount({ chosenFxForRange: async () => (reads++, open({ fx: [], label: '', result: { ...FX_CHOSEN.result, message: 'none' } })) });
    await start();
    await waitFor(() => expect(fx.chooser.state.phase === 'choosing' && fx.chooser.state.heardAt !== null).toBe(true));
    await act(async () => fx.chooser.keep());
    expect(fx.chooser.state).toMatchObject({ phase: 'choosing', problem: NOTHING_CHOSEN });
    await act(async () => fx.chooser.cancel());
    await flush();
    expect(removed).toEqual([expect.objectContaining({ chainName: DAW_CHOSEN_CHAIN })]);
    expect(fx.chooser.state.phase).toBe('idle');
    expect(log.recorded).toHaveLength(0);
  });

  it('with the window still open the choice waits for Keep it, then is kept', async () => {
    mount({ chosenFxForRange: async () => (reads++, open()) });
    await start();
    await waitFor(() => expect(fx.chooser.state.phase === 'choosing' && fx.chooser.state.choice?.label).toBe('ReaComp (Cockos)'));
    expect(log.recorded).toHaveLength(0);
    await act(async () => fx.chooser.keep());
    await waitFor(() => expect(log.recorded).toHaveLength(1));
  });

  it('a DAW refusal is a toast and nothing opens; a second start while one is open is ignored', async () => {
    const no: DawResult = {
      ok: false,
      changed: false,
      message: 'REAPER is recording. Stop recording first.',
      undoSteps: 0,
      refused: 'REAPER is recording. Stop recording first.',
    };
    mount({ chooseFxForRange: async (r) => (chose.push(r), no) });
    await start();
    expect(toast).toHaveBeenCalledWith('REAPER is recording. Stop recording first.', { tone: 'error' });
    expect(fx.chooser.state.phase).toBe('idle');
    cleanup();
    chose = [];
    mount({ chosenFxForRange: async () => (reads++, open({ fx: [], label: '' })) });
    await start();
    await start();
    expect(chose).toHaveLength(1);
  });

  it('a read that fails is shown and the next read clears it; Check again asks at once', async () => {
    let fail = true;
    mount({
      chosenFxForRange: async () => {
        reads++;
        if (fail) throw new Error('no answer');
        return open({ fx: [], label: '' });
      },
    });
    await start();
    await waitFor(() => expect(fx.chooser.state).toMatchObject({ phase: 'choosing', problem: 'no answer' }));
    fail = false;
    const before = reads;
    await act(async () => fx.chooser.check());
    await flush();
    expect(reads).toBeGreaterThan(before);
    expect(fx.chooser.state).toMatchObject({ phase: 'choosing', problem: '' });
  });

  it('words across two paragraphs are refused before the DAW is asked', async () => {
    mount();
    await start(['p-1:0', 'p-2:0']);
    expect(chose).toHaveLength(0);
    expect(toast.mock.calls[0][1]).toEqual({ tone: 'error' });
  });

  it('taking a chosen effect off cannot be undone from the app: the DAW alone knows the plug-in', async () => {
    const daw = createMockDawClient(DAW_SETUPS.reaper);
    const command = removeFxCommand(
      { daw, log, onEffects: () => {} },
      { kind: 'daw', dawName: 'REAPER' },
      {
        chapterId: 'chapter-1',
        fx: { ...({} as WordFx), id: 'fx1', chainId: DAW_CHOSEN_CHAIN, chainName: 'ReaComp (Cockos)', keys: [], text: 'x' },
        locator,
      },
    );
    const undone = await command.undo?.({ chainId: DAW_CHOSEN_CHAIN } as WordFx);
    expect(undone).toEqual({ ok: false, refusal: { code: 'chosen_in_daw', reason: CHOSEN_NOT_REAPPLIED } });
  });
});
