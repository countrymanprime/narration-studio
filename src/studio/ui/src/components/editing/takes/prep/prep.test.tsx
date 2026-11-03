// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { useMemo, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import { createMockApi } from '../../../../api/mockApi';
import type { NarrationApi } from '../../../../types';
import type { TakeEvidenceResult } from '../../../../api/contracts/takeEvidence';
import { DAW_SETUPS, type DawSetupId } from '../../../../fixtures/daw';
import { overlay } from '../../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../../ports/daw';
import type { TakesPort } from '../../../../ports/takes';
import { PortOverrides } from '../../../../ports/usePort';
import { createJournal, type Journal } from '../../../../studio/journal/createJournal';
import { buildWordMenu } from '../../menu/wordMenuRegistry';
import { marksDoc } from '../../script/scriptFixtures';
import { summarize } from '../../model';
import { LINE_BUSY, createLineBusy, useKeepTakes } from '../keepTake';
import { unevenPassage } from '../takeFixtures';
import { TakeLines } from '../TakeLines';
import { useTakesGate } from '../useTakesGate';
import type { LinePassage } from '../types';
import { HideOthersConfirmBody } from './HideOthersConfirm';
import { evidenceOf, longPausePassage, ONE_PAUSE, withPause } from './prepFixtures';
import { PrepConfirmBody } from './PrepConfirm';
import { useHideOthers } from './useHideOthers';
import type { RangesOf } from './prepSteps';
import { usePrepSteps } from './usePrepSteps';

let journal: Journal;
let daw: DawClient;
let dawCalls: string[];
let hideTakes: ReturnType<typeof vi.fn>;
/** While set, the host's useTake and hideTakes wait for it: a call on its way. */
let holdKeep: Promise<void> | null = null;
let holdHide: Promise<void> | null = null;
let deleteRange: ReturnType<typeof vi.fn>;
let evidence: ReturnType<typeof vi.fn>;
let levelMatchPreview: Mock<NarrationApi['levelMatchPreview']>;
let levelMatchApply: Mock<NarrationApi['levelMatchApply']>;
let confirm: ReturnType<typeof vi.spyOn>;
let toast: ReturnType<typeof vi.spyOn>;
let hide: ReturnType<typeof useHideOthers>;
let nextEvidence: TakeEvidenceResult | Error;
let rangesOf: Mock<RangesOf>;

function makeDaw(setup: DawSetupId, refuse?: string): DawClient {
  const base = createMockDawClient(DAW_SETUPS[setup], { chapterIds: ['5'], candidateIds: ['t-7', 't-8', 't-9'], findingIds: [] });
  hideTakes = vi.fn(async (...a: Parameters<DawClient['hideTakes']>) => {
    await holdHide;
    return base.hideTakes(...a);
  });
  const useTakeHeld = vi.fn(async (...a: Parameters<DawClient['useTake']>) => {
    await holdKeep;
    return base.useTake(...a);
  });
  deleteRange = vi.fn(async (...a: Parameters<DawClient['deleteRange']>) =>
    refuse ? { ok: false, changed: false, message: refuse, undoSteps: 0, refused: refuse } : base.deleteRange(...a),
  );
  const wrapped = { ...base, hideTakes, deleteRange, useTake: useTakeHeld } as DawClient;
  return new Proxy(wrapped, {
    get: (t, k: keyof DawClient) =>
      typeof t[k] === 'function' && k !== 'capabilities' ? (...a: unknown[]) => (dawCalls.push(String(k)), (t[k] as (...x: unknown[]) => unknown)(...a)) : t[k],
  });
}

function Page({ passage }: { passage: LinePassage }) {
  // One busy map for both, as the Editing page holds it.
  const busy = useMemo(createLineBusy, []);
  const { kept, keep } = useKeepTakes(journal, undefined, busy);
  const gate = useTakesGate();
  const [, setTick] = useState(0);
  hide = useHideOthers({ journal, kept, current: () => passage, passageOf: () => passage, busy });
  const prep = usePrepSteps({ journal, hidden: hide.hiddenIds, rangesOf });
  const shown = hide.shown(prep.prepared(passage));
  return (
    <main>
      <button type="button" data-h onClick={() => (hide.handlers.hideOthers(), setTick((n) => n + 1))}>
        H
      </button>
      <TakeLines
        passage={shown}
        onTake={null}
        keptId={kept[passage.id] ?? null}
        playingId={null}
        gate={gate}
        onKeep={(t) => void keep(passage, t)}
        onPlay={() => {}}
      />
    </main>
  );
}

function mount(passage: LinePassage = longPausePassage(), setup: DawSetupId = 'reaper', refuse?: string, wrap: (n: ReactNode) => ReactNode = (n) => n) {
  daw = makeDaw(setup, refuse);
  const takes: TakesPort = { evidence: evidence as TakesPort['evidence'] };
  const api = { ...createMockApi(), levelMatchPreview, levelMatchApply };
  return render(
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw, takes }}>{wrap(<Page passage={passage} />)}</PortOverrides>
    </ApiProvider>,
  );
}

const flush = () => act(async () => {});
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const confidence = (): number => Number(/· (\d\.\d\d)/.exec(document.querySelector('[data-suggested]')!.textContent!)![1]);
const keepT8 = async () => {
  fireEvent.click(button('Keep T-8'));
  await flush();
};
const pressH = async () => {
  fireEvent.click(document.querySelector('[data-h]')!);
  await flush();
};

beforeEach(() => {
  holdKeep = null;
  holdHide = null;
  journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });
  dawCalls = [];
  confirm = vi.spyOn(overlay, 'confirm').mockResolvedValue(true);
  toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
  vi.spyOn(overlay, 'toastUndo').mockImplementation(() => {});
  rangesOf = vi.fn<RangesOf>(async () => ONE_PAUSE);
  levelMatchPreview = vi.fn<NarrationApi['levelMatchPreview']>(async () => ({ candidates: [{ itemGuid: '{1}', deltaDb: 2.4 }] }));
  levelMatchApply = vi.fn<NarrationApi['levelMatchApply']>(async () => ({ changed: [{ itemGuid: '{1}', beforeVolume: 1, afterVolume: 1.3 }], stale: [] }));
  nextEvidence = evidenceOf(withPause(longPausePassage(), 1.0));
  evidence = vi.fn(async () => {
    if (nextEvidence instanceof Error) throw nextEvidence;
    return nextEvidence;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('hide-others-needs-a-kept-take-first', () => {
  it('says "Keep a take first" from H and from the menu, and calls nothing', async () => {
    mount();
    await flush();
    await pressH();
    expect(toast).toHaveBeenCalledWith('Keep a take first.');
    expect(confirm).not.toHaveBeenCalled();
    expect(hideTakes).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Keep a take first.' })).toBeTruthy();
    const items = buildWordMenu({
      doc: marksDoc(),
      keys: ['a'],
      summary: summarize(marksDoc(), ['a'], [], (t) => t),
      play: vi.fn(),
      notify: vi.fn(),
    }).groups.flat();
    const item = items.find((i) => i.key === 'hide-others');
    expect(item?.unavailable).toBe('Keep a take first.');
    // XED-21: one shortcut style, the key at the row's end.
    expect(item?.label).toBe('Hide the other takes');
    expect(item?.shortcut).toEqual(['H']);
  });

  it('after a keep it asks, hides the others in one DAW call, and a second press shows them again without one', async () => {
    mount();
    await flush();
    await keepT8();
    await pressH();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].title).toMatch(/hide the other takes/i);
    expect(hideTakes).toHaveBeenCalledTimes(1);
    expect(hideTakes).toHaveBeenCalledWith('5', 10, 20, 't-8');
    expect((await journal.entries()).filter((e) => /Hid 2 other takes/.test(e.label))).toHaveLength(1);
    expect(toast.mock.calls.at(-1)![0]).toMatch(/hidden, not deleted/);
    expect(document.querySelectorAll('[data-take]')).toHaveLength(1);
    await pressH();
    expect(document.querySelectorAll('[data-take]')).toHaveLength(3);
    await pressH();
    expect(document.querySelectorAll('[data-take]')).toHaveLength(1);
    expect(hideTakes).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('a hide the host rejects shows an error toast and hides nothing', async () => {
    mount();
    await flush();
    await keepT8();
    hideTakes.mockRejectedValueOnce(new Error('the host went away'));
    await pressH();
    expect(toast).toHaveBeenLastCalledWith('Could not hide the other takes: the host went away', { tone: 'error' });
    expect(document.querySelectorAll('[data-take]')).toHaveLength(3);
  });

  it('a second Hide while the first is on its way sends one hideTakes and asks once', async () => {
    mount();
    await flush();
    await keepT8();
    let release!: () => void;
    holdHide = new Promise<void>((r) => (release = r));
    await pressH();
    await pressH();
    await pressH();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(hideTakes).toHaveBeenCalledTimes(1);
    release();
    holdHide = null;
    await flush();
    await flush();
    expect(hideTakes).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[data-take]')).toHaveLength(1);
  });

  it('a Hide pressed while a Keep is still on its way hides nothing (it would act on the take that was kept before) and says so', async () => {
    mount();
    await flush();
    await keepT8();
    let release!: () => void;
    holdKeep = new Promise<void>((r) => (release = r));
    fireEvent.click(button('Keep T-9'));
    await flush();
    await pressH();
    expect(hideTakes).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(toast).toHaveBeenLastCalledWith(LINE_BUSY);
    release();
    holdKeep = null;
    await flush();
  });

  it('a Keep pressed while a Hide is on its way sends nothing and says so', async () => {
    mount();
    await flush();
    await keepT8();
    let release!: () => void;
    holdHide = new Promise<void>((r) => (release = r));
    await pressH();
    dawCalls.length = 0;
    fireEvent.click(button('Keep T-9'));
    await flush();
    expect(dawCalls).not.toContain('useTake');
    expect(toast).toHaveBeenLastCalledWith(LINE_BUSY);
    release();
    holdHide = null;
    await flush();
    await flush();
  });

  it('cancelling the question hides nothing', async () => {
    confirm.mockResolvedValue(false);
    mount();
    await flush();
    await keepT8();
    await pressH();
    expect(hideTakes).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-take]')).toHaveLength(3);
  });
});

describe('nothing-is-deleted', () => {
  it('hiding calls the DAW to mute and nothing else, and no source file names a take deletion', async () => {
    mount();
    await flush();
    await keepT8();
    dawCalls.length = 0;
    await pressH();
    expect(dawCalls).toEqual(['hideTakes']);
    const sources = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.tsx', '!./*.stories.tsx', '!./prepFixtures.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    for (const [file, text] of Object.entries(sources)) expect(text as string, file).not.toMatch(/deleteTake|removeTake|dropTake|discardTake/);
  });

  it('the confirmation says the takes are muted and still in the project', () => {
    render(<HideOthersConfirmBody keptLabel="T-8" count={2} dawName="REAPER" />);
    expect(document.body.textContent).toMatch(/muted/);
    expect(document.body.textContent).toMatch(/not deleted/i);
    expect(document.body.textContent).toMatch(/one undo step in REAPER/);
  });
});

describe('prep-steps-are-offered-never-run-by-themselves', () => {
  it('opening the passage and loading evidence calls no DAW method, no cut and no level match', async () => {
    mount();
    await flush();
    expect(dawCalls).toEqual([]);
    expect(deleteRange).not.toHaveBeenCalled();
    expect(levelMatchPreview).not.toHaveBeenCalled();
    expect(levelMatchApply).not.toHaveBeenCalled();
    expect(button('Trim white space')).toBeTruthy();
    expect(button('Trim breaths')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Normalise' })).toBeNull();
  });

  it('a step runs only after its confirmation is accepted', async () => {
    confirm.mockResolvedValueOnce(false);
    mount();
    await flush();
    fireEvent.click(button('Trim white space'));
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(deleteRange).not.toHaveBeenCalled();
    expect(evidence).not.toHaveBeenCalled();
    expect(await journal.entries()).toHaveLength(0);
  });
});

describe('a-prep-step-is-one-undo-and-rescores', () => {
  it('cuts once, adds one history entry named for the step, asks for the evidence again and the confidence rises', async () => {
    mount();
    await flush();
    const before = confidence();
    fireEvent.click(button('Trim white space'));
    await flush();
    expect(deleteRange).toHaveBeenCalledTimes(1);
    expect(deleteRange).toHaveBeenCalledWith({ chapterId: '5', firstToken: 12, lastToken: 13, mode: 'close', fadeMs: 10 });
    const entries = await journal.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toMatch(/Trimmed white space/);
    expect(evidence).toHaveBeenCalledTimes(1);
    expect(evidence).toHaveBeenCalledWith('5', 10, 20);
    expect(confidence()).toBeGreaterThan(before);
    expect(screen.queryByRole('button', { name: 'Trim white space' })).toBeNull();
    expect(document.querySelector('[data-takes-footer]')!.textContent).toMatch(/Trim white space: done/);
  });

  it('the confirmation says what changes and how it is undone', () => {
    render(<PrepConfirmBody step="trim-silence" dawName="REAPER" cuts={1} />);
    expect(document.body.textContent).toMatch(/Cuts track/);
    expect(document.body.textContent).toMatch(/Undo it in REAPER/);
  });
});

describe('normalise-uses-the-item-gain-path', () => {
  it('previews with levelMatchPreview, applies with levelMatchApply and makes no cut', async () => {
    mount(unevenPassage());
    await flush();
    fireEvent.click(button('Normalise'));
    await flush();
    expect(levelMatchPreview).toHaveBeenCalledTimes(1);
    expect(levelMatchPreview.mock.calls[0][0]).toBe('5');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(levelMatchApply).toHaveBeenCalledTimes(1);
    expect(deleteRange).not.toHaveBeenCalled();
    expect((await journal.entries())[0].label).toMatch(/Normalised/);
  });

  it("when the DAW cannot match levels the control is off with the capability's own sentence", async () => {
    mount(unevenPassage(), 'audacity');
    await flush();
    const message = DAW_SETUPS.audacity.capabilities.item_gain.message!;
    expect(screen.getAllByRole('group', { name: message }).length).toBeGreaterThan(0);
    expect((button('Normalise') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button('Normalise'));
    await flush();
    expect(levelMatchPreview).not.toHaveBeenCalled();
  });
});

describe('refusal-changes-nothing', () => {
  it('a DAW refusal shows its sentence, keeps the figures and adds no history entry', async () => {
    mount(longPausePassage(), 'reaper', 'The item changed in REAPER since it was read.');
    await flush();
    const before = confidence();
    fireEvent.click(button('Trim white space'));
    await flush();
    expect(toast).toHaveBeenCalledWith('The item changed in REAPER since it was read.', { tone: 'error' });
    expect(await journal.entries()).toHaveLength(0);
    expect(evidence).not.toHaveBeenCalled();
    expect(confidence()).toBe(before);
    expect(button('Trim white space')).toBeTruthy();
  });

  it('a trim with no pauses located is refused with a sentence and cuts nothing', async () => {
    rangesOf.mockResolvedValue([]);
    mount();
    await flush();
    fireEvent.click(button('Trim white space'));
    await flush();
    expect(deleteRange).not.toHaveBeenCalled();
    expect(toast.mock.calls.at(-1)![0]).toMatch(/Nothing to trim/);
    expect(await journal.entries()).toHaveLength(0);
  });

  it('a level match that throws shows the error and changes nothing', async () => {
    levelMatchApply.mockRejectedValue(new Error('REAPER is not running.'));
    mount(unevenPassage());
    await flush();
    fireEvent.click(button('Normalise'));
    await flush();
    expect(toast.mock.calls.at(-1)![0]).toMatch(/REAPER is not running/);
    expect(await journal.entries()).toHaveLength(0);
    expect(evidence).not.toHaveBeenCalled();
  });
});

describe('hidden-takes-leave-the-suggestion', () => {
  it('hiding the other takes recomputes the suggestion without them', async () => {
    mount();
    await flush();
    expect(document.querySelector('[data-suggested]')!.textContent).toMatch(/Suggested: T-7/);
    await keepT8();
    await pressH();
    expect(document.querySelector('[data-suggested]')?.textContent ?? '').not.toMatch(/Suggested: T-7/);
    expect(document.querySelector('[data-take="t-7"]')).toBeNull();
  });
});

describe('stale-evidence-is-never-shown-as-current', () => {
  it('while a step runs the figures are withdrawn and the passage says it is updating', async () => {
    let release: (r: TakeEvidenceResult) => void = () => {};
    evidence.mockImplementation(() => new Promise<TakeEvidenceResult>((r) => (release = r)));
    mount();
    await flush();
    fireEvent.click(button('Trim white space'));
    await waitFor(() => expect(document.querySelector('[data-takes-footer]')!.textContent).toMatch(/Updating the figures/));
    expect(document.querySelector('[data-evidence]')).toBeNull();
    expect(document.querySelector('[data-suggested]')!.textContent).not.toMatch(/(High|Medium|Low) · /);
    await act(async () => release(evidenceOf(withPause(longPausePassage(), 1.0))));
    expect(document.querySelector('[data-evidence]')).not.toBeNull();
    expect(document.querySelector('[data-takes-footer]')!.textContent).not.toMatch(/Updating/);
  });

  it('when the figures cannot be measured again the old ones stay withdrawn and the passage says so', async () => {
    nextEvidence = new Error('The host could not measure.');
    mount();
    await flush();
    fireEvent.click(button('Trim white space'));
    await flush();
    expect(deleteRange).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-evidence]')).toBeNull();
    expect(document.querySelector('[data-takes-footer]')!.textContent).toMatch(/could not be measured again/);
  });
});

describe('atlas-and-axe', () => {
  it('has no axe violations with the controls in every state', async () => {
    mount(unevenPassage(), 'audacity');
    await flush();
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
