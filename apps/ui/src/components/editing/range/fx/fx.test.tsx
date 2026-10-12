// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../api/ApiContext';
import type { DawCapabilities } from '../../../../api/contracts/daw';
import type { EditCut } from '../../../../api/contracts/editCuts';
import type { WordFx } from '../../../../api/contracts/wordFx';
import { createMockApi } from '../../../../api/mockApi';
import { COMMAND_CATALOG } from '../../../../input/commands.catalog';
import { gesture } from '../../../../input/gestures';
import type { GestureEvent, InputSource } from '../../../../input/InputSource';
import { defaultKeymap } from '../../../../input/keymap';
import { CommandRouter, CommandScope } from '../../../../input/router';
import { DAW_SETUPS, fxChainsSource } from '../../../../fixtures/daw';
import { OverlayHost } from '../../../../overlay/OverlayHost';
import { overlay } from '../../../../overlay/overlayService';
import type { AlignmentPort } from '../../../../ports/alignment';
import { createMockDawClient, type DawClient } from '../../../../ports/daw';
import { createMockFxChains, type FxChainsPort } from '../../../../ports/fxchains';
import { PortOverrides } from '../../../../ports/usePort';
import { createJournal, type Journal } from '../../../../studio/journal/createJournal';
import { SelectionBar } from '../../bar/SelectionBar';
import type { ScriptPlayback } from '../../bar/useScriptPlayback';
import { useEditingKeys } from '../../keys/useEditingKeys';
import { buildWordMenu } from '../../menu/wordMenuRegistry';
import { summarize, type ChapterDoc } from '../../model';
import { EditingPageProvider, useEditingPage } from '../../script/EditingPageState';
import { marksDoc } from '../../script/scriptFixtures';
import { docCutsOf } from '../common/locate';
import { FxMarker } from './FxButtons';
import { beforeFx, fxPlanFor, fxSpan, NEEDS_CONFIRM, NO_AUDIO, NO_BACKUP, ONLY_SAID, SPANS_TWO_PARAGRAPHS, SPANS_TWO_TAKES } from './fxCommand';
import { fakeFxLog, listOf, withFxRange } from './fxFixtures';
import { fxPlanText } from './fxText';
import { useFxWords, type FxWords } from './useFxWords';
import { fakeCutLog, locator } from '../cut/cutFixtures';

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

const CHAINS = ['Podcast Voice.RfxChain', 'Vocal Chain/Warmth.RfxChain'];
const SOURCE = fxChainsSource('REAPER');

let journal: Journal;
let last: 'this' | 'other' | 'unknown';
let log: ReturnType<typeof fakeFxLog>;
let applied: Parameters<DawClient['applyFxToRange']>[0][];
let removed: Parameters<DawClient['removeFxFromRange']>[0][];
let snapMoved: number;
let page: ReturnType<typeof useEditingPage>;
let fx: FxWords;
let doc: ChapterDoc;
let chains: FxChainsPort | undefined;
let cutRecords: EditCut[];
let cap: ((r: { keys: string[] }) => string) | undefined;
let toast: ReturnType<typeof vi.spyOn>;
let toastUndo: ReturnType<typeof vi.spyOn>;

const alignment: AlignmentPort = {
  heard: () => Promise.reject(new Error('not used')),
  snap: (_c, _g, t) => Promise.resolve({ snapped: true, time: t + snapMoved, moved: snapMoved }),
};

function Inner({ effects, setEffects }: { effects: WordFx[]; setEffects: (e: WordFx[]) => void }) {
  page = useEditingPage();
  doc = page.doc;
  fx = useFxWords({
    journal,
    chapterId: 'chapter-1',
    chapterName: 'Chapter 1',
    effects,
    cuts: cutRecords,
    locator,
    onEffects: setEffects,
    cap,
    chains,
  });
  useEditingKeys({ handlers: { fx: fx.fx }, keymap });
  return (
    <>
      <SelectionBar playback={idle} end={60} />
      {fx.menu}
      {effects.map((e) => (
        <FxMarker key={e.id} fx={e} onSelect={() => {}} onRemove={(f) => void fx.remove(f)} />
      ))}
    </>
  );
}
function Harness() {
  const [effects, setEffects] = useState<WordFx[]>([]);
  const d = useMemo(
    () => marksDoc({ cuts: docCutsOf(cutRecords), effects: effects.filter((e) => !e.stale).map((e) => ({ id: e.id, keys: e.keys })) }),
    [effects],
  );
  return (
    <EditingPageProvider doc={d}>
      <Inner effects={effects} setEffects={setEffects} />
    </EditingPageProvider>
  );
}

const keymap = defaultKeymap(COMMAND_CATALOG, false);
let press: (code: string) => void;

function mount(setup: DawCapabilities = DAW_SETUPS.reaper, over: Partial<DawClient> = {}) {
  const base = createMockDawClient(setup);
  const daw: DawClient = {
    ...base,
    applyFxToRange: (r) => (applied.push(r), base.applyFxToRange(r)),
    removeFxFromRange: (r) => (removed.push(r), base.removeFxFromRange(r)),
    ...over,
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
const dialog = () => screen.getByRole('dialog');
const enabled = (el: HTMLElement) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';
const dialogText = (attr: string) => dialog().querySelector(`[${attr}]`)?.textContent ?? '';
const openMenu = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add FX' }));
  await screen.findByRole('menu');
};
const menuItem = (name: string | RegExp) => screen.getByRole('menuitem', { name });
const confirmAdd = async (name: RegExp = /^(Split and add effect|Back up and apply effect)$/) => {
  await waitFor(() => expect(enabled(within(dialog()).getByRole('button', { name }))).toBe(true));
  fireEvent.click(within(dialog()).getByRole('button', { name }));
  await flush();
};
/** Opens the menu on a selection of the first two words and chooses a chain, which opens the question. */
const choose = async (name: string | RegExp = 'Podcast Voice.RfxChain') => {
  await select('p-1:0', 'p-1:1');
  await openMenu();
  fireEvent.click(menuItem(name));
  await screen.findByRole('dialog');
};

beforeEach(() => {
  last = 'unknown';
  journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => last });
  log = fakeFxLog();
  applied = [];
  removed = [];
  snapMoved = 0;
  cutRecords = [];
  cap = undefined;
  chains = listOf(SOURCE, CHAINS);
  beforeFx.length = 0;
  toast = vi.spyOn(overlay, 'toast');
  toastUndo = vi.spyOn(overlay, 'toastUndo');
});
afterEach(() => {
  overlay.getSnapshot().dialogs.forEach((d) => (d.kind === 'confirm' ? d.answer(false) : d.close()));
  overlay.getSnapshot().toasts.forEach((t) => overlay.dismissToast(t.id));
  cleanup();
  vi.restoreAllMocks();
});

describe('the Add FX menu', () => {
  it('menu-lists-the-daws-own-chains: the bar lists the port under its source line and a disabled Manage item; a different port changes the menu with no change to the screen', async () => {
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    await openMenu();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([SOURCE, ...CHAINS, expect.stringMatching(/^Manage in REAPER…/)]);
    expect(menuItem(/Manage in REAPER…/).hasAttribute('data-disabled')).toBe(true);
    expect(menuItem(CHAINS[0]).hasAttribute('data-disabled')).toBe(false);
    cleanup();

    chains = listOf('Your Audacity macros', ['Normalize']);
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    await openMenu();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Your Audacity macros',
      'Normalize',
      expect.stringMatching(/^Manage in REAPER…/),
    ]);
  });

  it('menu-lists-the-daws-own-chains: the right-click menu and F list the same effects', async () => {
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    const sum = summarize(doc, ['p-1:0', 'p-1:1'], [], (t) => t);
    const items = buildWordMenu({ doc, keys: ['p-1:0', 'p-1:1'], summary: sum, play: vi.fn(), notify: vi.fn() }).groups.flat();
    expect(items.filter((i) => i.key.startsWith('fx')).map((i) => i.label)).toEqual([SOURCE, ...CHAINS, 'Manage in REAPER…']);
    expect(items.find((i) => i.key === 'fx-manage')?.unavailable).toBeTruthy();
    press('KeyF');
    await screen.findByRole('menu');
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toContain(CHAINS[1]);
  });

  it('the host list is the default: with no port given the menu reads the DAW capability and workspaceListFXChains', async () => {
    chains = undefined;
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    await openMenu();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      SOURCE,
      'Podcast Voice.RfxChain',
      'Vocal Warmth.RfxChain',
      expect.stringMatching(/^Manage in REAPER…/),
    ]);
  });

  it('a-daw-that-cannot-says-why-on-the-item: REAPER not running disables the items with the capability sentence; the bar button stays and says why', async () => {
    chains = createMockFxChains(DAW_SETUPS['reaper-off']);
    mount(DAW_SETUPS['reaper-off']);
    await flush();
    await select('p-1:0', 'p-1:1');
    const off = DAW_SETUPS['reaper-off'].capabilities.fx_range?.message as string;
    const button = screen.getByRole('button', { name: 'Add FX' });
    expect(button.getAttribute('aria-description')).toContain(off);
    fireEvent.click(button);
    expect(screen.queryByRole('menu')).toBeNull();
    const sum = summarize(doc, ['p-1:0', 'p-1:1'], [], (t) => t);
    const items = buildWordMenu({ doc, keys: ['p-1:0', 'p-1:1'], summary: sum, play: vi.fn(), notify: vi.fn() }).groups.flat();
    const fxItems = items.filter((i) => i.key.startsWith('fx'));
    expect(fxItems).toEqual([expect.objectContaining({ key: 'fx-off', unavailable: off }), expect.objectContaining({ key: 'fx-manage' })]);
    expect(applied).toEqual([]);
  });

  it('a-daw-that-cannot-says-why-on-the-item: a selection the DAW cannot do keeps the chains and disables each with the reason', async () => {
    mount();
    await flush();
    await select('p-1:7', 'p-2:1');
    const sum = summarize(doc, ['p-1:7', 'p-2:0', 'p-2:1'], [], (t) => t);
    const items = buildWordMenu({ doc, keys: ['p-1:7', 'p-2:0', 'p-2:1'], summary: sum, play: vi.fn(), notify: vi.fn() }).groups.flat();
    const chainItems = items.filter((i) => i.key.startsWith('fx:'));
    expect(chainItems.map((i) => i.label)).toEqual(CHAINS);
    for (const i of chainItems) expect(i.unavailable).toBe(SPANS_TWO_PARAGRAPHS);
  });

  it('a-daw-that-cannot-says-why-on-the-item: a capability that is on with no chains says the DAW lists none', async () => {
    chains = listOf(SOURCE, []);
    mount();
    await flush();
    await select('p-1:0', 'p-1:1');
    await openMenu();
    const none = menuItem(/No effects listed/);
    expect(none.hasAttribute('data-disabled')).toBe(true);
    expect(none.textContent).toContain(`${SOURCE} lists no effects yet`);
  });
});

describe('F', () => {
  it('f-key-needs-a-selection: with nothing selected it says so and opens nothing; with a DAW that cannot it gives the reason', async () => {
    mount();
    await flush();
    press('KeyF');
    expect(toast).toHaveBeenLastCalledWith('Select some words first.');
    expect(screen.queryByRole('menu')).toBeNull();
    cleanup();

    chains = createMockFxChains(DAW_SETUPS['reaper-off']);
    mount(DAW_SETUPS['reaper-off']);
    await flush();
    await select('p-1:0', 'p-1:1');
    press('KeyF');
    expect(toast).toHaveBeenLastCalledWith(DAW_SETUPS['reaper-off'].capabilities.fx_range?.message, { tone: 'error' });
  });
});

describe('the preview', () => {
  it('choosing-a-chain-opens-the-preview-and-applies-nothing: the words, snapped ends, the pieces, the chain and the DAW sentence; Cancel changes nothing', async () => {
    snapMoved = 0.0012;
    mount();
    await flush();
    await choose();
    expect(dialog().getAttribute('aria-label') ?? dialog().textContent).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Add FX to 2 words?' })).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(dialogText('data-fx-snap')).toBe('The start moved 1.2 ms to a zero crossing. The end moved 1.2 ms to a zero crossing.'));
    expect(dialogText('data-fx-words')).toBe('Alice was');
    expect(dialogText('data-fx-split-at')).toMatch(/^0:0\d and 0:0\d · 0\.\d s in the middle$/);
    expect(dialogText('data-fx-in')).toBe('Chapter 1 · track “Chapter 1”');
    expect(dialogText('data-fx-chain')).toBe(`${CHAINS[0]} · from “${SOURCE}”`);
    expect(dialogText('data-fx-split')).toBe(`Piece 1 · unchangedPiece 2 · ${CHAINS[0]}Piece 3 · unchanged`);
    expect(dialogText('data-fx-plan')).toBe(fxPlanText({ kind: 'daw', dawName: 'REAPER' }));
    expect(applied).toEqual([]);

    fireEvent.change(within(dialog()).getByRole('combobox', { name: 'Effect' }), { target: { value: CHAINS[1] } });
    expect(dialogText('data-fx-chain')).toBe(`${CHAINS[1]} · from “${SOURCE}”`);
    expect(dialogText('data-fx-split')).toContain(`Piece 2 · ${CHAINS[1]}`);

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(applied).toEqual([]);
    expect(log.effects).toEqual([]);
    expect(await journal.entries()).toEqual([]);
  });
});

describe('applying', () => {
  it('applying-is-daw-first-recorded-and-one-undo: the DAW is asked, the accepted effect is recorded in original time, one entry; Undo takes it off', async () => {
    mount();
    await flush();
    const [a, b] = [doc.items[doc.index.get('p-1:0') ?? 0].t0 as number, doc.items[doc.index.get('p-1:1') ?? 0].t1 as number];
    await choose();
    await confirmAdd();
    expect(applied).toEqual([{ chapterId: 'chapter-1', firstToken: 0, lastToken: 1, chainName: CHAINS[0], fadeMs: 8 }]);
    expect(log.effects).toHaveLength(1);
    expect(log.effects[0]).toMatchObject({
      pid: 'p-1',
      keys: ['p-1:0', 'p-1:1'],
      a,
      b,
      chainId: CHAINS[0],
      chainName: CHAINS[0],
      source: SOURCE,
      fadeMs: 8,
      daw: 'REAPER',
    });
    const rows = await journal.entries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: expect.stringMatching(/^Added Podcast Voice\.RfxChain to 2 words at 0:0\d$/), daw: true });
    expect(doc.items[doc.index.get('p-1:0') ?? 0].fx).toEqual(['fx1']);
    expect(document.querySelector('[data-fx-marker]')).toBeTruthy();
    expect(toastUndo).toHaveBeenCalledWith(expect.stringContaining(CHAINS[0]), expect.any(Function));

    last = 'this';
    await act(async () => void (await journal.undo(1)));
    expect(removed).toEqual([{ chapterId: 'chapter-1', firstToken: 0, lastToken: 1, chainName: CHAINS[0] }]);
    expect(log.effects).toEqual([]);
    expect(doc.items[doc.index.get('p-1:0') ?? 0].fx).toEqual([]);
  });

  it('a refusal records nothing, adds no entry and shows the DAW sentence', async () => {
    const sentence = 'REAPER refused: the item changed. Reload the workspace.';
    mount(DAW_SETUPS.reaper, {
      applyFxToRange: (r) => (
        applied.push(r),
        Promise.resolve({ ok: false, changed: false, message: sentence, undoSteps: 0, refused: sentence, code: 'stale' })
      ),
    });
    await flush();
    await choose();
    await confirmAdd();
    expect(applied).toHaveLength(1);
    expect(log.recorded).toEqual([]);
    expect(await journal.entries()).toEqual([]);
    expect(toast).toHaveBeenLastCalledWith(sentence, { tone: 'error' });
    expect(doc.items[doc.index.get('p-1:0') ?? 0].fx).toEqual([]);
  });
});

describe('the underline and the marker', () => {
  it('underline-and-marker-remove-the-effect: the marker names the chain, its control removes the effect through the DAW, then the record; one entry; Undo puts it back', async () => {
    mount();
    await flush();
    await choose();
    await confirmAdd();
    expect(doc.items[doc.index.get('p-1:1') ?? 0].fx).toEqual(['fx1']);
    const marker = screen.getByRole('button', { name: `${CHAINS[0]} on Alice was. Options` });
    fireEvent.click(marker);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove the effect' }));
    await flush();
    expect(removed).toEqual([{ chapterId: 'chapter-1', firstToken: 0, lastToken: 1, chainName: CHAINS[0] }]);
    expect(log.effects).toEqual([]);
    expect(doc.items[doc.index.get('p-1:1') ?? 0].fx).toEqual([]);
    const rows = await journal.entries();
    expect(rows[0].label).toBe(`Took ${CHAINS[0]} off Alice was`);
    expect(rows).toHaveLength(2);

    last = 'this';
    await act(async () => void (await journal.undo(2)));
    expect(applied).toHaveLength(2);
    expect(log.effects).toHaveLength(1);
    expect(log.effects[0]).toMatchObject({ keys: ['p-1:0', 'p-1:1'], chainName: CHAINS[0] });
  });
});

describe('what an effect cannot go on', () => {
  const doc0 = marksDoc();
  const sum = (keys: string[]) => summarize(doc0, keys, [], (t) => t);
  const ready = { kind: 'daw', dawName: 'REAPER' } as const;
  const base = { plan: ready, locator, effects: [] as WordFx[] };

  it('a-selection-across-two-takes-is-refused: the reason says so, no range is given and the DAW is not asked', async () => {
    const one = sum(['p-1:0', 'p-1:1']);
    const second = { ...one.ranges[0], takeId: 'take-2' };
    const across = { ...one, ranges: [{ ...one.ranges[0], takeId: 'take-1' }, second] };
    const plan = fxPlanFor({ ...base, summary: across });
    expect(plan).toEqual({ refusal: SPANS_TWO_TAKES, range: null, over: null });
    expect(SPANS_TWO_TAKES).toMatch(/spans two takes/);
    expect(fxPlanFor({ ...base, summary: sum(['p-1:7', 'p-2:1']) }).refusal).toBe(SPANS_TWO_PARAGRAPHS);
    expect(applied).toEqual([]);
  });

  it('the control is disabled with the reason across two paragraphs, and no DAW call is made', async () => {
    mount();
    await flush();
    await select('p-1:7', 'p-2:1');
    expect(screen.getByRole('button', { name: 'Add FX' }).getAttribute('aria-description')).toContain(SPANS_TWO_PARAGRAPHS);
    press('KeyF');
    expect(toast).toHaveBeenLastCalledWith(SPANS_TWO_PARAGRAPHS, { tone: 'error' });
    expect(applied).toEqual([]);
  });

  it('the plan refuses words with no audio, words already cut, words not in the script, and a DAW that has not answered', () => {
    const miss = sum(['p-1:2']);
    expect(fxPlanFor({ ...base, summary: miss }).refusal).toBe(NO_AUDIO);
    const said = sum([doc0.items.find((i) => i.kind === 'x')?.key ?? '']);
    expect(said.audible.length).toBeGreaterThan(0);
    expect(fxPlanFor({ ...base, summary: said }).refusal).toBe(ONLY_SAID);
    expect(fxPlanFor({ ...base, plan: null, summary: sum(['p-1:0']) }).refusal).toBe('Checking what the DAW can do.');
    expect(fxPlanFor({ ...base, plan: { kind: 'refused', reason: 'No.' }, summary: sum(['p-1:0']) }).refusal).toBe('No.');
  });
});

describe('the DAW variants', () => {
  it('audacity-and-recorder-variants: Audacity backs up first and is refused without backups; its sentence names the steps', async () => {
    mount(withFxRange(DAW_SETUPS.audacity, 'steps'));
    await flush();
    await select('p-1:0', 'p-1:1');
    const button = screen.getByRole('button', { name: 'Add FX' });
    expect(button.getAttribute('aria-description')).toContain(NO_BACKUP);
    cleanup();

    const steps: string[] = [];
    beforeFx.push({
      name: 'backup',
      run: async ({ label }) => {
        steps.push(label);
        return { ok: true, value: { backupId: 'bk1' } };
      },
    });
    mount(withFxRange(DAW_SETUPS.audacity, 'steps'));
    await flush();
    await choose();
    expect(dialogText('data-fx-plan')).toBe(fxPlanText({ kind: 'backup-then-daw', dawName: 'Audacity', steps: 2 }));
    expect(dialogText('data-fx-plan')).toMatch(/backs up the stretch first/);
    await confirmAdd();
    expect(steps).toHaveLength(1);
    expect(log.recorded[0]).toMatchObject({ backupId: 'bk1', daw: 'Audacity' });
  });

  it('audacity-and-recorder-variants: the recorder keeps an effect entry and asks no DAW', async () => {
    mount(withFxRange(DAW_SETUPS.builtin, 'app'));
    await flush();
    await choose();
    expect(dialogText('data-fx-plan')).toBe(fxPlanText({ kind: 'recorder', dawName: 'the built-in recorder' }));
    await confirmAdd(/^Add effect entry$/);
    expect(applied).toEqual([]);
    expect(log.effects).toHaveLength(1);
    expect(log.effects[0].daw).toBe('the built-in recorder');
    expect((await journal.entries())[0].daw).toBe(false);

    fireEvent.click(await screen.findByRole('button', { name: `${CHAINS[0]} on Alice was. Options` }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove the effect' }));
    await flush();
    expect(removed).toEqual([]);
    expect(log.effects).toEqual([]);
  });
});

describe('earlier audio cut', () => {
  it('span-follows-the-audio-when-earlier-audio-is-cut: the underline sits on the same words and the shown time moves up', async () => {
    const base = marksDoc();
    const first = base.items[base.index.get('p-1:0') ?? 0];
    const cuts = fakeCutLog();
    await cuts.editingCutRecord('chapter-1', {
      pid: 'p-1',
      keys: ['p-1:0'],
      text: 'Alice',
      a: first.t0 as number,
      b: first.t1 as number,
      off0: first.off0 as number,
      off1: first.off1 as number,
      mode: 'close',
      fadeMs: 12,
      daw: 'REAPER',
      guid: 'g',
      undoSteps: 1,
    });
    cutRecords = (await cuts.editingCutsList('chapter-1')).cuts;
    const len = (first.t1 as number) - (first.t0 as number);
    const was = base.items[base.index.get('p-1:1') ?? 0];
    mount();
    await flush();
    await select('p-1:1', 'p-1:1');
    const word = doc.items[doc.index.get('p-1:1') ?? 0];
    expect(word.t0).toBeCloseTo((was.t0 as number) - len, 3);
    await openMenu();
    fireEvent.click(menuItem(CHAINS[0]));
    await screen.findByRole('dialog');
    await confirmAdd();
    const stored = log.effects[0];
    expect(stored.a).toBeCloseTo(was.t0 as number, 3);
    expect(doc.items[doc.index.get('p-1:1') ?? 0].fx).toEqual(['fx1']);
    const span = fxSpan(stored, docCutsOf(cutRecords));
    expect(span.start).toBeCloseTo(stored.a - len, 3);
    expect(span.start).toBeCloseTo(word.t0 as number, 2);
  });
});

describe('over the cap or on top of an effect', () => {
  it('over-the-cap-asks-first: an overlap reads Add anyway; the command refuses without it', async () => {
    mount();
    await flush();
    await choose();
    await confirmAdd();
    await select('p-1:1', 'p-1:2');
    await openMenu();
    fireEvent.click(menuItem(CHAINS[1]));
    await screen.findByRole('dialog');
    await waitFor(() => expect(dialog().querySelector('[data-fx-over]')).toBeTruthy());
    expect(dialogText('data-fx-over')).toContain(`${CHAINS[0]} is already on some of these words`);
    expect(within(dialog()).queryByRole('button', { name: /^Split and add effect$/ })).toBeNull();
    await confirmAdd(/^Add anyway$/);
    expect(log.effects).toHaveLength(2);
    expect(applied).toHaveLength(2);
  });

  it('over-the-cap-asks-first: the Effects tab cap puts its sentence in the dialog', async () => {
    cap = () => 'This takes effect coverage from 20% to 35%, over the 30% cap.';
    mount();
    await flush();
    await choose();
    await waitFor(() => expect(dialogText('data-fx-over')).toBe('This takes effect coverage from 20% to 35%, over the 30% cap.'));
    expect(within(dialog()).getByRole('button', { name: 'Add anyway' })).toBeTruthy();
  });

  it('the command refuses an over effect that was not confirmed, and the DAW is not asked', async () => {
    const { applyFxCommand } = await import('./fxCommand');
    const dawStub = { applyFxToRange: vi.fn(), removeFxFromRange: vi.fn() };
    const range = summarize(marksDoc(), ['p-1:0', 'p-1:1'], [], (t) => t).ranges[0];
    const command = applyFxCommand(
      { daw: dawStub, log, onEffects: () => {} },
      { kind: 'daw', dawName: 'REAPER' },
      { chapterId: 'chapter-1', range, chain: { id: 'x', name: 'x' }, source: SOURCE, locator, needsOver: true, confirmedOver: false },
    );
    expect(await command.run()).toEqual({ ok: false, refusal: { code: 'needs_confirm', reason: NEEDS_CONFIRM } });
    expect(dawStub.applyFxToRange).not.toHaveBeenCalled();
  });
});
