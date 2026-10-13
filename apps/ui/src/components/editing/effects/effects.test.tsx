// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities } from '../../../api/contracts/daw';
import type { WordFx } from '../../../api/contracts/wordFx';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, fxChainsSource } from '../../../fixtures/daw';
import { OverlayHost } from '../../../overlay/OverlayHost';
import { overlay } from '../../../overlay/overlayService';
import type { AlignmentPort } from '../../../ports/alignment';
import { createMockDawClient, type DawClient, type FxList, type FxRangeSettingChange } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { createJournal } from '../../../studio/journal/createJournal';
import { Drawer } from '../drawer/Drawer';
import { drawSections } from '../drawer/drawerSections';
import { summarize } from '../model';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import { applyFxCommand, fxPlanFor } from '../range/fx/fxCommand';
import { fakeFxLog, listOf, withFxRange } from '../range/fx/fxFixtures';
import { useFxWords, type FxWords } from '../range/fx/useFxWords';
import { locator } from '../range/cut/cutFixtures';
import { planRange } from '../range/common/rangePlan';
import { AddEffect, SELECT_FIRST } from './AddEffect';
import { CoverageStrip } from './CoverageStrip';
import { EffectInspector } from './EffectInspector';
import { EffectHostProvider, type EffectHost } from './EffectSettings';
import { EffectsList } from './EffectsList';
import { capSentence, capState, coverageOf, coverageOfEffects, FX_CAP_LABEL, FX_CAP_PCT, impactOf } from './effectsMath';
import { EffectsTab, effectsCount, type EffectsTabProps } from './EffectsTab';
import { MANY, ONE, TOTAL, wordFx } from './effectsFixtures';
import { OnWords } from './OnWords';
import { fxCapOf } from './useFxCap';
import { registerEffectsSection } from './registerEffectsSection';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SOURCE = fxChainsSource('REAPER');
const LIST: FxList = { source: SOURCE, choices: [{ id: 'Podcast Voice.RfxChain', name: 'Podcast Voice.RfxChain' }] };
const doc = marksDoc();
const CHAINS = listOf(SOURCE, ['Podcast Voice.RfxChain']);

describe('coverage is the union of the effects that are on', () => {
  it('counts overlapping effects once and gives the figure as a share of the chapter', () => {
    const c = coverageOf(
      [
        { start: 0, end: 10 },
        { start: 5, end: 15 },
      ],
      100,
    );
    expect(c.segs).toEqual([
      { start: 0, end: 5, n: 1 },
      { start: 5, end: 10, n: 2 },
      { start: 10, end: 15, n: 1 },
    ]);
    expect(c.sec).toBe(15);
    expect(c.pct).toBe(15);
    expect(coverageOfEffects(MANY, [], TOTAL).sec).toBe(24);
    expect(coverageOfEffects(MANY, [], TOTAL).pct).toBe(12);
  });
  it('leaves out an effect whose words changed, and follows the audio when earlier audio is cut', () => {
    expect(coverageOfEffects([wordFx('s', { stale: true })], [], TOTAL).sec).toBe(0);
    expect(coverageOfEffects(ONE, [{ a: 0, b: 4, mode: 'close' }], TOTAL).segs).toEqual([{ start: 6, end: 18, n: 1 }]);
  });
  it('a bypassed effect does not count toward the coverage cap', () => {
    const fx2Off = MANY.map((f) => (f.id === 'fx2' ? { ...f, bypassed: true } : f));
    // fx1 (10 to 22) and fx3 (100 to 104) are on: 16 s, 8%. With fx2 counted it was 24 s, 12%, over the cap.
    expect(coverageOfEffects(fx2Off, [], TOTAL).sec).toBe(16);
    expect(coverageOfEffects(fx2Off, [], TOTAL).pct).toBe(8);
    // Turning fx3 on is judged against the effects that are on: fx1 alone with fx3 stays within the cap.
    const others = fx2Off.filter((f) => f.id !== 'fx3');
    expect(impactOf(others, [], TOTAL, { start: 100, end: 104 })).toMatchObject({ before: 6, after: 8, over: false });
    expect(capSentence(others, [], TOTAL, { start: 100, end: 104 })).toBe('');
    expect(impactOf(MANY.slice(0, 2), [], TOTAL, { start: 100, end: 104 }).over).toBe(true);
  });
  it('judges the figure against the cap: within, over, far over', () => {
    expect(capState(10, 10)).toBe('within');
    expect(capState(10.1, 10)).toBe('over');
    expect(capState(20.1, 10)).toBe('far');
  });
  it('the strip draws each effect span, and the figure and legend update when an effect is added or removed', () => {
    const view = render(<CoverageStrip effects={ONE} cuts={[]} total={TOTAL} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('Effects cover 6.0% of this chapter')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    view.rerender(<CoverageStrip effects={MANY} cuts={[]} total={TOTAL} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('Effects cover 12.0% of this chapter')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByText('2 or more')).toBeTruthy();
    view.rerender(<CoverageStrip effects={[]} cuts={[]} total={TOTAL} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('Effects cover 0.0% of this chapter')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
  it('shows the cap with its source and a stronger state when it is crossed far', () => {
    const view = render(<CoverageStrip effects={ONE} cuts={[]} total={TOTAL} selectedId={null} onSelect={() => {}} />);
    expect((screen.getByRole('textbox', { name: FX_CAP_LABEL }) as HTMLInputElement).value).toBe('10');
    expect(screen.getByText('Within the cap')).toBeTruthy();
    view.rerender(<CoverageStrip effects={MANY} cuts={[]} total={TOTAL} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('Over the cap')).toBeTruthy();
    view.rerender(<CoverageStrip effects={ONE} cuts={[]} total={40} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('Far over the cap')).toBeTruthy();
  });
});

describe('the list, the words and the inspector', () => {
  it('on-words-lists-each-effect-with-its-chain-words-and-place', () => {
    const select = vi.fn();
    const remove = vi.fn();
    render(<OnWords effects={MANY} cuts={[]} onSelect={select} onRemove={remove} />);
    const row = document.querySelector('[data-wfx="fx1"]') as HTMLElement;
    expect(row.textContent).toContain('Podcast Voice');
    expect(row.textContent).toContain('“The first” · 0:10–0:22');
    expect(screen.getByText('On words · 3')).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Select the words' }));
    expect(select).toHaveBeenCalledWith(MANY[0]);
    fireEvent.click(within(row).getByRole('button', { name: 'Remove the effect' }));
    expect(remove).toHaveBeenCalledWith(MANY[0]);
  });
  it('draws nothing for a chapter with no effects on words', () => {
    const { container } = render(<OnWords effects={[]} cuts={[]} onSelect={() => {}} onRemove={() => {}} />);
    expect(container.textContent).toBe('');
  });
  it('lists each effect with its range, what it is on and its share of the chapter', () => {
    render(<EffectsList effects={MANY} cuts={[]} total={TOTAL} selectedId="fx2" onSelect={() => {}} />);
    const rows = [...document.querySelectorAll('[data-fxr]')];
    expect(rows.map((r) => r.getAttribute('data-fxr'))).toEqual(['fx1', 'fx2', 'fx3']);
    expect(rows[0].closest('tr')?.textContent).toContain('0:10–0:22');
    expect(rows[0].closest('tr')?.textContent).toContain('6.0%');
    expect(rows[1].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Effects · 3')).toBeTruthy();
  });
  it('says so when there are none', () => {
    render(<EffectsList effects={[]} cuts={[]} total={TOTAL} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('No effects on this chapter yet.')).toBeTruthy();
  });
  it('inspector-controls-the-daw-cannot-do-are-disabled-with-a-reason: Remove works', () => {
    const remove = vi.fn();
    render(
      <ApiProvider api={createMockApi()}>
        <EffectInspector fx={MANY[0]} cuts={[]} total={TOTAL} dawName="REAPER" onRemove={remove} />
      </ApiProvider>,
    );
    expect(screen.getByText('Podcast Voice', { selector: 'h3' })).toBeTruthy();
    expect(screen.getByText('“The first”')).toBeTruthy();
    expect(screen.getByText('6.0% of this chapter')).toBeTruthy();
    for (const name of ['Settings', 'Preview', 'Compare']) {
      const b = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
      expect(document.getElementById(b.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Not available in REAPER.');
    }
    const bypass = screen.getByRole('checkbox', { name: 'Bypass this effect' });
    expect(bypass.hasAttribute('disabled') || bypass.getAttribute('aria-disabled') === 'true' || bypass.hasAttribute('data-disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this effect' }));
    expect(remove).toHaveBeenCalledWith(MANY[0]);
  });
});

describe('Add effect', () => {
  const add = (over: Partial<Parameters<typeof AddEffect>[0]> = {}) => {
    const onAdd = vi.fn();
    render(<AddEffect hasSelection reason="" impact={{ before: 6, after: 7, over: false, far: false }} cap={FX_CAP_PCT} list={LIST} onAdd={onAdd} {...over} />);
    return onAdd;
  };
  it('add-effect-needs-a-selection: with no words it is off and says so', () => {
    const onAdd = add({ hasSelection: false, impact: null });
    const b = screen.getByRole('button', { name: 'Add effect' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(screen.getByText(SELECT_FIRST)).toBeTruthy();
    expect(onAdd).not.toHaveBeenCalled();
  });
  it('with a selection it asks for the question, and shows what coverage becomes', () => {
    const onAdd = add();
    expect(document.querySelector('[data-impact]')?.textContent).toBe('Coverage 6.0% → 7.0%');
    fireEvent.click(screen.getByRole('button', { name: 'Add effect' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
  it('a DAW that cannot shows its own reason and keeps the control, disabled', () => {
    add({ reason: 'REAPER is not running.' });
    expect((screen.getByRole('button', { name: 'Add effect' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('REAPER is not running.')).toBeTruthy();
  });
  it('lists the DAW’s own chains under their source', () => {
    add();
    expect(within(screen.getByRole('group', { name: SOURCE })).getByText('Podcast Voice.RfxChain')).toBeTruthy();
  });
  it('cap-warns-before-it-is-crossed-never-silently: over it the button reads Add anyway; a much larger cover says more', () => {
    add({ impact: { before: 9, after: 12, over: true, far: false } });
    expect(screen.getByRole('alert').textContent).toContain('from 9.0% to 12.0%, over the 10.0% cap.');
    expect(screen.getByRole('button', { name: 'Add anyway' })).toBeTruthy();
    cleanup();
    add({ impact: { before: 9, after: 25, over: true, far: true } });
    expect(screen.getByRole('alert').textContent).toContain('more than twice the cap');
  });
  it('the command refuses without the confirmation over the cap', () => {
    const range = summarize(doc, ['p-1:0', 'p-1:1'], [], (t) => t).ranges[0];
    expect(capSentence(MANY, [], TOTAL, { start: 50, end: 70 })).toBe('This takes coverage from 12.0% to 22.0%, over the 10.0% cap.');
    expect(capSentence(ONE, [], TOTAL, range)).toBe('');
    expect(impactOf(MANY, [], TOTAL, { start: 50, end: 70 }).far).toBe(true);
    const plan = planRange(withFxRange(DAW_SETUPS.reaper, 'native'), 'fx_range');
    const summary = summarize(doc, ['p-1:0', 'p-1:1'], [], (t) => t);
    const result = fxPlanFor({ plan, summary, locator, effects: [], cap: () => capSentence(MANY, [], TOTAL, { start: 50, end: 70 }) });
    expect(result.over?.cap).toContain('over the 10.0% cap');
    if (plan.kind === 'refused') throw new Error('plan');
    const log = fakeFxLog();
    const daw = createMockDawClient(withFxRange(DAW_SETUPS.reaper, 'native'));
    const command = applyFxCommand({ daw, log, onEffects: () => {} }, plan, {
      chapterId: 'chapter-1',
      range: summary.ranges[0],
      chain: { id: 'Podcast Voice.RfxChain', name: 'Podcast Voice' },
      source: SOURCE,
      locator,
      needsOver: true,
      confirmedOver: false,
    });
    return expect(command.run()).resolves.toMatchObject({ ok: false, refusal: { code: 'needs_confirm' } });
  });
});

let dawSetup: DawCapabilities;
let fxStub: EffectsTabProps['fx'];
let selectWords: EffectsTabProps['onSelectWords'] & ReturnType<typeof vi.fn>;
const base = (over: Partial<EffectsTabProps> = {}): EffectsTabProps => ({
  doc,
  effects: MANY,
  cuts: [],
  total: TOTAL,
  selected: [],
  fx: fxStub,
  onSelectWords: selectWords,
  ...over,
});
const withApi = (node: React.ReactNode) => (
  <ApiProvider api={{ ...createMockApi(), dawCapabilities: async () => dawSetup, subscribeDawCapabilities: () => () => {} }}>{node}</ApiProvider>
);

beforeEach(() => {
  dawSetup = DAW_SETUPS.reaper;
  selectWords = vi.fn() as typeof selectWords;
  fxStub = { list: LIST, ask: vi.fn(), remove: vi.fn(async () => {}), refusalOf: () => '' };
});

describe('the tab', () => {
  it('click-on-the-strip-selects-the-effect-and-shows-it-in-the-inspector', async () => {
    render(withApi(<EffectsTab {...base()} />));
    const inspector = () => screen.getByRole('region', { name: 'Effect' });
    expect(within(inspector()).getByText('Podcast Voice', { selector: 'h3' })).toBeTruthy();
    fireEvent.click(document.querySelector('button[data-fx="fx3"]') as HTMLElement);
    expect(within(inspector()).getByText('De-ess', { selector: 'h3' })).toBeTruthy();
    expect(within(inspector()).getByText('“Second”')).toBeTruthy();
    expect(within(inspector()).getByText('1:40–1:44')).toBeTruthy();
    expect(within(inspector()).getByText('2.0% of this chapter')).toBeTruthy();
  });
  it('Select the words and Remove the effect go through the page', () => {
    render(withApi(<EffectsTab {...base()} />));
    const row = document.querySelector('[data-wfx="fx2"]') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Select the words' }));
    expect(selectWords).toHaveBeenCalledWith(['p-1:1', 'p-1:2']);
    fireEvent.click(within(row).getByRole('button', { name: 'Remove the effect' }));
    expect(fxStub.remove).toHaveBeenCalledWith(MANY[1]);
  });
  it('add-effect-needs-a-selection and, with one, opens the question', () => {
    const view = render(withApi(<EffectsTab {...base()} />));
    expect((screen.getByRole('button', { name: 'Add effect' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(SELECT_FIRST)).toBeTruthy();
    view.rerender(withApi(<EffectsTab {...base({ effects: ONE, selected: ['p-2:0', 'p-2:1'] })} />));
    fireEvent.click(screen.getByRole('button', { name: 'Add effect' }));
    expect(fxStub.ask).toHaveBeenCalledWith(['p-2:0', 'p-2:1']);
  });
  it('a DAW that cannot add shows the capability’s reason as a note', () => {
    fxStub = { ...fxStub, refusalOf: () => 'REAPER cannot add effects to a range here.' };
    render(withApi(<EffectsTab {...base({ effects: ONE, selected: ['p-2:0'] })} />));
    expect((screen.getByRole('button', { name: 'Add effect' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('REAPER cannot add effects to a range here.')).toBeTruthy();
  });
  it('the cap can be changed and the state follows it', async () => {
    const api = createMockApi();
    render(
      <ApiProvider api={{ ...api, dawCapabilities: async () => dawSetup, subscribeDawCapabilities: () => () => {} }}>
        <EffectsTab {...base({ selected: ['p-1:0', 'p-1:1', 'p-1:2', 'p-1:3', 'p-1:4', 'p-1:5', 'p-1:6', 'p-1:7', 'p-1:8'], total: 40 })} />
      </ApiProvider>,
    );
    const field = () => screen.getByRole('textbox', { name: FX_CAP_LABEL }) as HTMLInputElement;
    await waitFor(() => expect(field().disabled).toBe(false));
    expect(field().value).toBe('10');
    expect(screen.getByText('Far over the cap')).toBeTruthy();
    fireEvent.change(field(), { target: { value: '90' } });
    expect(screen.getByText('Within the cap')).toBeTruthy();
    fireEvent.change(field(), { target: { value: '40' } });
    expect(screen.getByText('Over the cap')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('over the 40.0% cap');
    await waitFor(async () => expect(fxCapOf(await api.settingsForScope('project'))).toBe(40));
  });
  it('a refused save puts the cap back and says why; a host without the field keeps the default', async () => {
    const api = createMockApi();
    const saveSettings = vi.fn(async () => {
      throw new Error('setting fx_cap_pct must be between 1 and 100 %');
    });
    render(
      <ApiProvider api={{ ...api, saveSettings, dawCapabilities: async () => dawSetup, subscribeDawCapabilities: () => () => {} }}>
        <EffectsTab {...base()} />
      </ApiProvider>,
    );
    const field = () => screen.getByRole('textbox', { name: FX_CAP_LABEL }) as HTMLInputElement;
    await waitFor(() => expect(field().disabled).toBe(false));
    fireEvent.change(field(), { target: { value: '50' } });
    await waitFor(() => expect(screen.getByText('setting fx_cap_pct must be between 1 and 100 %')).toBeTruthy());
    fireEvent.blur(field());
    await waitFor(() => expect(field().value).toBe('10'));
    expect(screen.getByText('Over the cap')).toBeTruthy();
    expect(saveSettings).toHaveBeenCalledWith('Editing', 'project', { fx_cap_pct: '50' });
    expect(fxCapOf({})).toBe(FX_CAP_PCT);
  });
  it('over the cap the button reads Add anyway', () => {
    render(withApi(<EffectsTab {...base({ selected: ['p-1:0', 'p-1:1', 'p-1:2', 'p-1:3', 'p-1:4', 'p-1:5', 'p-1:6', 'p-1:7', 'p-1:8'], total: 40 })} />));
    expect(screen.getByRole('button', { name: 'Add anyway' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('over the 10.0% cap');
  });
  it('recorder-and-audacity-wording: the built-in recorder names itself; Audacity lists its macros under its source', async () => {
    dawSetup = DAW_SETUPS.builtin;
    const view = render(withApi(<EffectsTab {...base()} />));
    await waitFor(() => expect(screen.getAllByText('Not available in the built-in recorder.').length).toBe(3));
    view.unmount();
    dawSetup = DAW_SETUPS['audacity-backups'];
    fxStub = { ...fxStub, list: { source: 'Your Audacity macros', choices: [{ id: 'Normalize', name: 'Normalize' }] } };
    render(withApi(<EffectsTab {...base()} />));
    await waitFor(() => expect(screen.getAllByText('Not available in Audacity.').length).toBe(3));
    expect(within(screen.getByRole('group', { name: 'Your Audacity macros' })).getByText('Normalize')).toBeTruthy();
  });
});

describe('the drawer', () => {
  it('tab-count-matches: the tab wears the number of effects and the section is registered through the registry', () => {
    const off = registerEffectsSection({ effects: MANY, cuts: [], total: TOTAL, selected: [], fx: fxStub, onSelectWords: selectWords });
    const tabs = [
      ['cleanup', 'Clean up'],
      ['effects', 'Effects'],
    ] as const;
    render(
      withApi(
        <Drawer
          doc={doc}
          chapterId="chapter-1"
          tab="effects"
          tabs={tabs}
          counts={{ effects: effectsCount(MANY) }}
          onTab={() => {}}
          onClose={() => {}}
          flagKind={null}
          onReview={() => {}}
          strip={{} as never}
        />,
      ),
    );
    expect(screen.getByRole('tab', { name: 'Effects · 3' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Effects' })).toBeTruthy();
    off();
    expect(drawSections('effects', { doc, chapterId: 'chapter-1' })).toHaveLength(0);
  });
});

describe('the page’s own Add FX and Remove', () => {
  let fx: FxWords | undefined;
  let removed: unknown[];
  const alignment: AlignmentPort = {
    heard: () => Promise.reject(new Error('not used')),
    snap: (_c, _g, t) => Promise.resolve({ snapped: true, time: t, moved: 0 }),
  };
  function Inner({ effects, setEffects }: { effects: WordFx[]; setEffects: (e: WordFx[]) => void }) {
    const page = useEditingPage();
    fx = useFxWords({
      journal: createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' }),
      chapterId: 'chapter-1',
      chapterName: 'Chapter 1',
      effects,
      cuts: [],
      locator,
      onEffects: setEffects,
      chains: CHAINS,
    });
    return <EffectsTab doc={page.doc} effects={effects} cuts={[]} total={TOTAL} selected={page.selected} fx={fx} onSelectWords={() => {}} />;
  }
  function Harness() {
    const [effects, setEffects] = useState<WordFx[]>(ONE);
    const d = useMemo(() => marksDoc(), []);
    return (
      <EditingPageProvider doc={d}>
        <Inner effects={effects} setEffects={setEffects} />
      </EditingPageProvider>
    );
  }
  it('Remove takes the effect off through the DAW and the record, and the figure follows', async () => {
    removed = [];
    const base = createMockDawClient(withFxRange(DAW_SETUPS.reaper, 'native'));
    const daw: DawClient = { ...base, removeFxFromRange: (r) => (removed.push(r), base.removeFxFromRange(r)) };
    const log = fakeFxLog();
    log.effects.push(ONE[0]);
    vi.spyOn(overlay, 'toastUndo');
    render(
      <ApiProvider api={Object.assign(createMockApi(), log)}>
        <PortOverrides clients={{ daw, alignment }}>
          <Harness />
          <OverlayHost />
        </PortOverrides>
      </ApiProvider>,
    );
    expect(screen.getByText('Effects cover 6.0% of this chapter')).toBeTruthy();
    await waitFor(() => expect(fx?.plan?.kind).toBe('daw'));
    await act(async () => {
      fireEvent.click(within(document.querySelector('[data-wfx="fx1"]') as HTMLElement).getByRole('button', { name: 'Remove the effect' }));
    });
    expect(removed).toHaveLength(1);
    await waitFor(() => expect(screen.getByText('Effects cover 0.0% of this chapter')).toBeTruthy());
    expect(log.effects).toHaveLength(0);
  });
});

describe('the inspector with a DAW that has the commands', () => {
  const target = { chapterId: 'chapter-1', firstToken: 0, lastToken: 1, chainName: 'Podcast Voice.RfxChain' };
  let sets: FxRangeSettingChange[];
  let bypasses: boolean[];
  let bypassed: boolean;
  let plays: [number, number][];
  let compares: unknown[];
  let stopsInDaw: number;
  let pageStops: number;
  let shown: WordFx[][];
  let log: ReturnType<typeof fakeFxLog>;
  let journal: ReturnType<typeof createJournal>;
  const host = (over: Partial<EffectHost> = {}): EffectHost => ({
    chapterId: 'chapter-1',
    locator,
    journal,
    effects: MANY,
    onEffects: (effects) => void shown.push(effects),
    play: (from, to) => void plays.push([from, to]),
    stop: () => void pageStops++,
    ...over,
  });
  const dawWith = (setup: DawCapabilities): DawClient => {
    const base = createMockDawClient(setup);
    return {
      ...base,
      fxRangeParams: async (t) => ({ ...(await base.fxRangeParams(t)), bypassed }),
      setFxRangeParam: (c) => (sets.push(c), base.setFxRangeParam(c)),
      bypassFxRange: (t, b) => ((bypassed = b), bypasses.push(b), base.bypassFxRange(t, b)),
      compareFxRange: (t) => (compares.push(t), base.compareFxRange(t)),
      stopFxCompare: () => (stopsInDaw++, base.stopFxCompare()),
    };
  };
  const show = (fx: WordFx, daw: DawClient, h: EffectHost = host()) =>
    render(
      <ApiProvider api={{ ...createMockApi(), ...log, dawCapabilities: async () => DAW_SETUPS.reaper }}>
        <PortOverrides clients={{ daw }}>
          <EffectHostProvider value={h}>
            <EffectInspector fx={fx} cuts={[]} total={TOTAL} dawName="REAPER" onRemove={() => {}} />
          </EffectHostProvider>
          <OverlayHost />
        </PortOverrides>
      </ApiProvider>,
    );
  const inspector = () => within(screen.getByRole('region', { name: 'Effect' }));
  beforeEach(() => {
    sets = [];
    bypasses = [];
    plays = [];
    compares = [];
    stopsInDaw = 0;
    pageStops = 0;
    shown = [];
    bypassed = false;
    log = fakeFxLog();
    log.effects.push(...MANY.map((f) => ({ ...f })));
    journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });
  });

  it('changes a setting, bypasses, previews and compares an effect, and asks before turning one on over the cap', async () => {
    const daw = dawWith(withFxRange(DAW_SETUPS.reaper, 'native'));
    const view = show(MANY[0], daw, host({ effects: ONE }));
    // The settings the DAW lists: a stepped one is a number field, a continuous one a slider.
    const mode = (await screen.findByRole('textbox', { name: 'Mode' })) as HTMLInputElement;
    expect(screen.getByRole('slider', { name: 'Gain' })).toBeTruthy();
    // A change is one DAW call and one journal entry.
    fireEvent.change(mode, { target: { value: '2' } });
    await waitFor(() => expect(sets).toEqual([{ ...target, fx: 0, index: 1, value: 2 }]));
    await waitFor(async () => expect((await journal.entries()).map((e) => e.label)).toEqual(['Set Mode of Podcast Voice to 2']));
    // Bypass is one DAW call and one entry; the box follows the DAW.
    const box = screen.getByRole('checkbox', { name: 'Bypass this effect' });
    fireEvent.click(box);
    await waitFor(() => expect(bypasses).toEqual([true]));
    await waitFor(() => expect(box.getAttribute('aria-checked')).toBe('true'));
    expect((await journal.entries())[0].label).toBe('Bypassed Podcast Voice');
    // Turning it back on while it stays inside the cap needs no question.
    fireEvent.click(box);
    await waitFor(() => expect(bypasses).toEqual([true, false]));
    // Preview plays the effect's words with 2 s either side.
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(plays).toEqual([[8, 24]]);
    view.unmount();
    cleanup();

    // fx3 sits apart; the other two cover 10%, so turning fx3 on takes the chapter to 12%, over the 10% cap: it asks first.
    bypassed = true;
    bypasses = [];
    show(MANY[2], daw);
    const inspector = () => within(screen.getByRole('region', { name: 'Effect' }));
    const off = await screen.findByRole('checkbox', { name: 'Bypass this effect' });
    await waitFor(() => expect(off.getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(off);
    expect(inspector().getByRole('alert').textContent).toContain('Turning this on takes coverage over the 10.0% cap.');
    expect(bypasses).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(inspector().queryByRole('alert')).toBeNull();
    expect(bypasses).toEqual([]);
    fireEvent.click(off);
    fireEvent.click(screen.getByRole('button', { name: 'Turn on anyway' }));
    await waitFor(() => expect(bypasses).toEqual([false]));
    expect(inspector().queryByRole('alert')).toBeNull();
  });

  it('a slider sends the one value it was let go on', async () => {
    show(MANY[0], dawWith(withFxRange(DAW_SETUPS.reaper, 'native')));
    const gain = await screen.findByRole('slider', { name: 'Gain' });
    fireEvent.change(gain, { target: { value: '4.8' } });
    fireEvent.change(gain, { target: { value: '9.6' } });
    expect(sets).toEqual([]);
    fireEvent.keyUp(gain, { key: 'ArrowRight' });
    await waitFor(() => expect(sets).toEqual([{ ...target, fx: 0, index: 0, value: 9.6 }]));
  });

  it('Compare plays the effect on and then off through the DAW', async () => {
    const daw = dawWith(withFxRange(DAW_SETUPS.reaper, 'native'));
    show(MANY[0], daw);
    await screen.findByRole('textbox', { name: 'Mode' });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    // The DAW plays both passes itself: the page's own playback stops, and nothing is bypassed from the page.
    await waitFor(() => expect(compares).toEqual([target]));
    expect(pageStops).toBe(1);
    expect(plays).toEqual([]);
    expect(bypasses).toEqual([]);
    expect((await inspector().findByRole('status')).textContent).toBe('With the effect');
    await waitFor(() => expect(inspector().getByRole('status').textContent).toBe('Without the effect'), { timeout: 2000 });
    await waitFor(() => expect(inspector().queryByRole('status')).toBeNull(), { timeout: 2000 });
    expect(screen.getByRole('button', { name: 'Compare' }).hasAttribute('disabled')).toBe(false);
    expect(stopsInDaw).toBe(0);
  });

  it('Compare is one journal entry with one Undo', async () => {
    const daw = dawWith(withFxRange(DAW_SETUPS.reaper, 'native'));
    show(MANY[0], daw);
    await screen.findByRole('textbox', { name: 'Mode' });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    await inspector().findByRole('status');
    // Stopping early asks the DAW to stop and put the effect back; the Compare stays one entry.
    fireEvent.click(screen.getByRole('button', { name: 'Stop comparing' }));
    await waitFor(() => expect(stopsInDaw).toBe(1));
    await waitFor(() => expect(inspector().queryByRole('status')).toBeNull());
    const entries = await journal.entries();
    expect(entries.map((e) => [e.label, e.daw, e.undoable])).toEqual([['Compared Podcast Voice with and without', true, true]]);
    // One Undo stops any Compare still playing and leaves the effect as it was before (on): no record changes.
    expect(await journal.undo(entries[0].id)).toMatchObject({ ok: true });
    expect(stopsInDaw).toBe(2);
    expect(bypasses).toEqual([false]);
    expect(await journal.entries()).toEqual([]);
    expect(log.effects.find((f) => f.id === 'fx1')?.bypassed).toBe(false);
  });

  it('a refused Compare adds no entry and says why', async () => {
    const base = dawWith(withFxRange(DAW_SETUPS.reaper, 'native'));
    const daw: DawClient = {
      ...base,
      compareFxRange: async () => ({
        result: { ok: false, changed: false, message: 'gone', undoSteps: 0, refused: 'That effect is gone.', code: 'stale' },
        pass: 0,
      }),
    };
    const toast = vi.spyOn(overlay, 'toast');
    show(MANY[0], daw);
    await screen.findByRole('textbox', { name: 'Mode' });
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('That effect is gone.', { tone: 'error' }));
    expect(inspector().queryByRole('status')).toBeNull();
    expect(await journal.entries()).toEqual([]);
  });

  it('Bypass is kept with the effect, so the figure leaves it out, and one Undo turns it on in the DAW and the record', async () => {
    const daw = dawWith(withFxRange(DAW_SETUPS.reaper, 'native'));
    show(MANY[0], daw);
    const box = await screen.findByRole('checkbox', { name: 'Bypass this effect' });
    await screen.findByRole('textbox', { name: 'Mode' });
    fireEvent.click(box);
    await waitFor(() => expect(log.effects.find((f) => f.id === 'fx1')?.bypassed).toBe(true));
    expect(bypasses).toEqual([true]);
    expect(shown.at(-1)?.find((f) => f.id === 'fx1')?.bypassed).toBe(true);
    // fx2 (20 to 30) and fx3 (100 to 104) are left: 14 s, 7%.
    expect(coverageOfEffects(shown.at(-1) ?? [], [], TOTAL).pct).toBeCloseTo(7);
    const [entry] = await journal.entries();
    expect(entry.label).toBe('Bypassed Podcast Voice');
    expect(await journal.undo(entry.id)).toMatchObject({ ok: true });
    expect(bypasses).toEqual([true, false]);
    expect(log.effects.find((f) => f.id === 'fx1')?.bypassed).toBe(false);
    expect(shown.at(-1)?.find((f) => f.id === 'fx1')?.bypassed).toBe(false);
  });

  it('an effect the DAW reports bypassed is recorded so, outside the history', async () => {
    bypassed = true;
    show(MANY[0], dawWith(withFxRange(DAW_SETUPS.reaper, 'native')));
    await waitFor(() => expect(log.effects.find((f) => f.id === 'fx1')?.bypassed).toBe(true));
    expect(shown.at(-1)?.find((f) => f.id === 'fx1')?.bypassed).toBe(true);
    expect(await journal.entries()).toEqual([]);
    expect(bypasses).toEqual([]);
  });

  it('turning an effect on is judged against the effects that are on: a bypassed one does not count', async () => {
    bypassed = true;
    const effects = MANY.map((f) => (f.id === 'fx2' || f.id === 'fx3' ? { ...f, bypassed: true } : f));
    show(effects[2], dawWith(withFxRange(DAW_SETUPS.reaper, 'native')), host({ effects }));
    const off = await screen.findByRole('checkbox', { name: 'Bypass this effect' });
    await waitFor(() => expect(off.getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(off);
    await waitFor(() => expect(bypasses).toEqual([false]));
    expect(within(screen.getByRole('region', { name: 'Effect' })).queryByRole('alert')).toBeNull();
  });

  it('a DAW without the commands keeps the controls off and says why', async () => {
    show(MANY[0], dawWith(DAW_SETUPS.builtin));
    await waitFor(() => expect(screen.getAllByText('Not available in REAPER.').length).toBe(3));
    for (const name of ['Settings', 'Preview', 'Compare']) expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Mode' })).toBeNull();
    expect(document.querySelector('[data-why]')?.textContent).toBeTruthy();
    expect(sets).toEqual([]);
    expect(bypasses).toEqual([]);
  });
});

describe('accessibility', () => {
  it('atlas-and-axe: the tab has no axe violations with effects, over the cap, and with none', async () => {
    for (const effects of [MANY, ONE, []]) {
      const view = render(withApi(<EffectsTab {...base({ effects, selected: effects.length ? ['p-2:0'] : [] })} />));
      const result = await axe.run(view.container, { rules: { 'color-contrast': { enabled: false } } });
      expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
      view.unmount();
    }
  });
});
