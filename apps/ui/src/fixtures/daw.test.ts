import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DAW_CAPABILITIES } from '../api/contracts/daw';
import { dawCapabilitiesSchema, dawProjectStateSchema } from '../api/schemas/daw';
import { parseWire } from '../api/wire/parseWire';
import {
  DAW_ANSWERS,
  DAW_PROJECT,
  DAW_PROJECT_STATES,
  DAW_SETUPS,
  type DawSetupId,
  pickupMarkersReadAnswer,
  pickupsImportedAnswer,
  FX_RANGE_STEPS,
  fxChainAddedAnswer,
  fxChainRemovedAnswer,
  fxChainsSource,
  fxNotOnItemAnswer,
  fxRangeOf,
  nothingToStackAnswer,
  STACK_STEPS,
  stackOf,
  takesStackedAnswer,
  takesUnstackedAnswer,
  RANGE_CUT_STEPS,
  rangeCutAnswer,
  rangeCutOf,
  rolledAnswer,
  rolledOf,
  rolledReplacingAnswer,
  takesHiddenAnswer,
} from './daw';

const SETUP_IDS: DawSetupId[] = ['reaper', 'reaper-off', 'builtin', 'audacity', 'audacity-backups'];

describe('the mock DAW setups', () => {
  it('mock-setups-are-data: holds REAPER, REAPER off, built-in and Audacity with and without backups', () => {
    expect(Object.keys(DAW_SETUPS).sort()).toEqual([...SETUP_IDS].sort());
  });

  it.each(SETUP_IDS)('mock-setups-are-data: %s is a DawCapabilities the schema accepts', (id) => {
    const parsed = parseWire(dawCapabilitiesSchema, DAW_SETUPS[id], { boundary: 'fixtures', payload: id });
    expect(parsed).toEqual(DAW_SETUPS[id]);
  });

  it.each(SETUP_IDS)('mock-setups-are-data: %s names exactly the capabilities the Go catalogue has today', (id) => {
    expect(Object.keys(DAW_SETUPS[id].capabilities).sort()).toEqual(DAW_CAPABILITIES.map((c) => c.key).sort());
  });

  it.each(SETUP_IDS)('mock-setups-are-data: in %s an unavailable capability carries its reason and sentence', (id) => {
    for (const [name, support] of Object.entries(DAW_SETUPS[id].capabilities)) {
      if (support.available) continue;
      expect(support.reason, name).toBeTruthy();
      expect(support.message, name).toBeTruthy();
    }
  });

  it('mock-setups-are-data: REAPER off is the same DAW that cannot be reached, and only reading the saved project still works', () => {
    expect(DAW_SETUPS['reaper-off'].daw).toBe(DAW_SETUPS.reaper.daw);
    expect(DAW_SETUPS['reaper-off'].reachable).toBe(false);
    const stillAvailable = Object.entries(DAW_SETUPS['reaper-off'].capabilities)
      .filter(([, s]) => s.available)
      .map(([name]) => name);
    expect(stillAvailable).toEqual(['project_read']);
  });

  it.each(SETUP_IDS)('no-saved-project-is-null: %s has a project state the schema accepts', (id) => {
    expect(parseWire(dawProjectStateSchema, DAW_PROJECT_STATES[id], { boundary: 'fixtures', payload: id })).toEqual(DAW_PROJECT_STATES[id]);
  });

  it('no-saved-project-is-null: only a reachable REAPER has a saved time, and the built-in recorder never has unsaved changes', () => {
    expect(DAW_PROJECT_STATES.reaper.savedAt).toBe('2026-09-26T08:40');
    for (const id of SETUP_IDS.filter((setup) => setup !== 'reaper')) expect(DAW_PROJECT_STATES[id].savedAt, id).toBeNull();
    expect(DAW_PROJECT_STATES.builtin.unsavedChanges).toBe(false);
  });

  it('mock-setups-are-data: a roll in Audacity is destructive only without backups', () => {
    expect(DAW_SETUPS.audacity.capabilities.punch.destructive).toBe(true);
    expect(DAW_SETUPS['audacity-backups'].capabilities.punch.destructive).toBeUndefined();
  });

  it('ui-mirror-names-exactly-the-go-catalogue: the four edit capabilities follow macro_render, in Go order', () => {
    const keys = DAW_CAPABILITIES.map((c) => c.key);
    const at = keys.indexOf('macro_render');
    expect(keys.slice(at + 1, at + 5)).toEqual(['cut_range', 'fx_range', 'stack_takes', 'backups']);
    expect(DAW_CAPABILITIES.slice(at + 1, at + 5).map((c) => c.label)).toEqual([
      'Cut words and audio',
      'Add an effect to words',
      'Stack takes',
      'Audio backups',
    ]);
  });

  it.each(['reaper', 'reaper-off'] as const)(
    'ui-mirror-names-exactly-the-go-catalogue: %s declares the edit capabilities with no bridge command not yet available with the host sentence',
    (id) => {
      for (const { key, label } of DAW_CAPABILITIES.filter((c) => ['backups'].includes(c.key))) {
        expect(DAW_SETUPS[id].capabilities[key], key).toEqual({
          level: 'not_yet_available',
          available: false,
          reason: 'not_yet',
          message: `${label} is not available with REAPER yet.`,
        });
      }
    },
  );

  it.each(['reaper', 'reaper-off'] as const)('mock-setup-agrees-with-the-host: %s declares punch native and not destructive', (id) => {
    expect(DAW_SETUPS[id].capabilities.punch.mode).toBe('native');
    expect(DAW_SETUPS[id].capabilities.punch.destructive).toBeUndefined();
  });

  it.each(['reaper', 'reaper-off'] as const)('mock-setup-agrees-with-the-host: %s declares cut_range experimental, native and not destructive', (id) => {
    expect(DAW_SETUPS[id].capabilities.cut_range.level).toBe('experimental');
    expect(DAW_SETUPS[id].capabilities.cut_range.mode).toBe('native');
    expect(DAW_SETUPS[id].capabilities.cut_range.destructive).toBeUndefined();
  });

  it.each(['reaper', 'reaper-off'] as const)('mock-setup-agrees-with-the-host: %s declares stack_takes experimental, native and not destructive', (id) => {
    expect(DAW_SETUPS[id].capabilities.stack_takes.level).toBe('experimental');
    expect(DAW_SETUPS[id].capabilities.stack_takes.mode).toBe('native');
    expect(DAW_SETUPS[id].capabilities.stack_takes.destructive).toBeUndefined();
  });

  it.each(['reaper', 'reaper-off'] as const)('mock-setup-agrees-with-the-host: %s declares fx_range experimental, native and not destructive', (id) => {
    expect(DAW_SETUPS[id].capabilities.fx_range.level).toBe('experimental');
    expect(DAW_SETUPS[id].capabilities.fx_range.mode).toBe('native');
    expect(DAW_SETUPS[id].capabilities.fx_range.destructive).toBeUndefined();
  });

  it('ui-mirror-names-exactly-the-go-catalogue: Audacity with backups still has no backups role here', () => {
    expect(DAW_SETUPS['audacity-backups'].capabilities.backups).toEqual(DAW_SETUPS.audacity.capabilities.backups);
    expect(DAW_SETUPS['audacity-backups'].capabilities.backups.level).toBe('not_yet_available');
  });

  // Like the Audacity setups, the built-in one has its Experimental rows switched on; every other row is the host's own.
  it("mock-setup-agrees-with-the-host: the built-in setup has the golden's level for every capability, and its reason and sentence wherever both refuse", () => {
    const golden = parseWire(
      dawCapabilitiesSchema,
      JSON.parse(readFileSync(fileURLToPath(new URL('../../../../tests/fixtures/contracts/daw-capabilities-builtin.json', import.meta.url)), 'utf8')),
      { boundary: 'fixtures', payload: 'daw-capabilities-builtin.json' },
    );
    for (const [name, host] of Object.entries(golden.capabilities)) {
      const setup = DAW_SETUPS.builtin.capabilities[name];
      expect(setup.level, name).toBe(host.level);
      if (host.reason === 'experimental_off') expect(setup.available, name).toBe(true);
      else expect(setup, name).toEqual(host);
    }
  });

  it("mock-refuses-stale-the-same-way: the mock's stale answers are the host's stale sentences, word for word", () => {
    const golden = (file: string): Record<string, unknown> =>
      JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../tests/fixtures/contracts/${file}`, import.meta.url)), 'utf8'));
    expect(golden('workspace-use-take-refused.json')).toMatchObject({ reason: 'stale', message: DAW_ANSWERS.staleTake });
    expect(golden('read-aloud-recordings.json')['track_missing.start']).toMatchObject({ reason: 'track_missing', message: DAW_ANSWERS.noTrack });
  });

  it("mock-pickup-answers-are-the-host's: the rename sentences are the Go service's and the Lua's, word for word", () => {
    const source = (path: string) => readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8');
    const service = source('apps/desktop/internal/pickups/service.go');
    const lua = source('integrations/reaper/narration_pickups.lua');
    expect(service).toContain(`"${DAW_ANSWERS.pickupResolved}"`);
    expect(service).toContain(`"${DAW_ANSWERS.pickupReopened}"`);
    expect(lua).toContain(`'${DAW_ANSWERS.noOpenPickup}'`);
    expect(lua).toContain(`'${DAW_ANSWERS.noResolvedPickup}'`);
    expect(pickupsImportedAnswer(1, 0)).toBe('Imported 1 pickup.');
    expect(pickupsImportedAnswer(0, 2)).toBe('Imported 0 pickups, 2 already there.');
    expect(pickupMarkersReadAnswer(0, 1)).toBe('Read 1 pickup marker: 0 open, 1 done.');
  });
});

describe('the hide-takes answers (SN-D52)', () => {
  const golden = (name: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../tests/fixtures/contracts/${name}`, import.meta.url)), 'utf8')) as { message: string };

  it("takesHiddenAnswer words what dawport/reaper's hiddenMessage does, and matches the host goldens", () => {
    expect(takesHiddenAnswer(1, 'REAPER')).toBe(golden('daw-hide-takes-done.json').message);
    expect(takesHiddenAnswer(0, 'REAPER')).toBe(golden('daw-hide-takes-nothing.json').message);
    expect(takesHiddenAnswer(3, 'REAPER')).toBe('Muted 3 other takes in REAPER. They are still in the project.');
  });

  it('the sample project has a take with no others to hide, and every candidate it counts is one it holds', () => {
    expect(DAW_PROJECT.otherTakes?.['take-solo']).toBe(0);
    expect(Object.keys(DAW_PROJECT.otherTakes ?? {}).every((id) => DAW_PROJECT.candidateIds.includes(id))).toBe(true);
    expect(DAW_ANSWERS.staleHide).toMatch(/nothing was changed/);
  });
});

describe('the roll answers (SN-D64)', () => {
  const golden = (name: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../tests/fixtures/contracts/${name}`, import.meta.url)), 'utf8')) as { message: string };

  it("rolledAnswer words what dawport/reaper's puncher does, and the refusals match the host goldens", () => {
    expect(rolledAnswer(40)).toBe(golden('daw-roll-done.json').message);
    expect(golden('daw-roll-refused-confirm.json').message).toBe(DAW_ANSWERS.rollConfirm);
    expect(golden('daw-roll-refused-stale.json').message).toBe(DAW_ANSWERS.rollStale);
  });

  it('rolledOf keeps the earlier audio with no undo point where punch is not destructive, and replaces it in one step where it is', () => {
    expect(rolledOf(DAW_SETUPS.reaper, 12)).toEqual({ message: rolledAnswer(12), undoSteps: 0 });
    expect(DAW_SETUPS.audacity.capabilities.punch.destructive).toBe(true);
    expect(rolledOf(DAW_SETUPS.audacity, 12)).toEqual({ message: rolledReplacingAnswer(12), undoSteps: 1 });
    expect(DAW_SETUPS['audacity-backups'].capabilities.punch.destructive).toBeUndefined();
  });
});

describe('the range cut answers (SN-D65)', () => {
  const golden = (name: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../tests/fixtures/contracts/${name}`, import.meta.url)), 'utf8')) as { message: string };

  it("rangeCutAnswer words what dawport/reaper's rangeCutter does, and the stale refusal matches the host golden", () => {
    expect(rangeCutAnswer(1, 'REAPER')).toBe(golden('daw-delete-range-done.json').message);
    expect(rangeCutAnswer(1, 'REAPER')).toBe(golden('daw-delete-range-gap.json').message);
    expect(rangeCutAnswer(3, 'REAPER')).toBe('Deleted 3 words and their audio in REAPER.');
    expect(golden('daw-delete-range-refused-stale.json').message).toBe(DAW_ANSWERS.rangeStale);
  });

  it("rangeCutOf answers one undo step on REAPER (native), and the steps list where the capability's mode is steps", () => {
    expect(DAW_SETUPS.reaper.capabilities.cut_range.mode).toBe('native');
    expect(rangeCutOf(DAW_SETUPS.reaper, 2)).toEqual({ message: rangeCutAnswer(2, 'REAPER'), undoSteps: 1 });
    const steps = {
      ...DAW_SETUPS.reaper,
      capabilities: { ...DAW_SETUPS.reaper.capabilities, cut_range: { level: 'experimental' as const, available: true, mode: 'steps' as const } },
    };
    expect(rangeCutOf(steps, 2)).toEqual({ message: rangeCutAnswer(2, 'REAPER'), undoSteps: 2, steps: [...RANGE_CUT_STEPS] });
  });
});

describe('the FX range answers (SN-D66)', () => {
  const golden = (name: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../tests/fixtures/contracts/${name}`, import.meta.url)), 'utf8')) as { message: string };
  const chain = 'Podcast Voice.RfxChain';

  it("words what dawport/reaper's rangeFXApplier and the binding do, as the host goldens have them", () => {
    expect(fxChainAddedAnswer(chain, 1, 'REAPER')).toBe(golden('daw-apply-fx-range-done.json').message);
    expect(fxChainAddedAnswer(chain, 3, 'REAPER')).toBe('Added Podcast Voice.RfxChain to 3 words in REAPER.');
    expect(fxChainRemovedAnswer(chain, 'REAPER')).toBe(golden('daw-remove-fx-range-done.json').message);
    expect(fxNotOnItemAnswer(chain)).toMatch(/^Podcast Voice\.RfxChain is not on the item .* run the check again/);
    expect(fxChainsSource('REAPER')).toBe('Your REAPER FX chains');
  });

  it('the fixture project lists the chains of the host golden', () => {
    const listed = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../../../tests/fixtures/contracts/workspace-fx-chains.json', import.meta.url)), 'utf8'),
    ) as {
      names: string[];
    };
    expect(DAW_PROJECT.fxChains).toEqual(listed.names);
  });

  it("fxRangeOf answers one undo step on REAPER (native), and the steps list where the capability's mode is steps", () => {
    expect(DAW_SETUPS.reaper.capabilities.fx_range.mode).toBe('native');
    expect(fxRangeOf(DAW_SETUPS.reaper, chain, 2)).toEqual({ message: fxChainAddedAnswer(chain, 2, 'REAPER'), undoSteps: 1 });
    const withMode = (mode: 'steps' | 'app') => ({
      ...DAW_SETUPS.reaper,
      capabilities: { ...DAW_SETUPS.reaper.capabilities, fx_range: { level: 'experimental' as const, available: true, mode } },
    });
    expect(fxRangeOf(withMode('steps'), chain, 2)).toEqual({ message: fxChainAddedAnswer(chain, 2, 'REAPER'), undoSteps: 2, steps: [...FX_RANGE_STEPS] });
    expect(fxRangeOf(withMode('app'), chain, 2).undoSteps).toBe(0);
  });
});

describe('the stack answers (SN-D72)', () => {
  const golden = (name: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../tests/fixtures/contracts/${name}`, import.meta.url)), 'utf8')) as {
      message: string;
      undoSteps: number;
      steps?: string[];
    };

  it("words what dawport/reaper's takeStacker does, as the host goldens have them", () => {
    expect(takesStackedAnswer(1, 'REAPER')).toBe(golden('daw-stack-done.json').message);
    expect(takesUnstackedAnswer(1, 'REAPER')).toBe(golden('daw-unstack-done.json').message);
    expect(takesStackedAnswer(3, 'REAPER')).toBe('Stacked 3 takes in REAPER.');
    expect(nothingToStackAnswer('REAPER')).toBe('There are no retries to move in REAPER.');
  });

  it('stackOf answers one undo step on REAPER (native), and the steps of the steps golden where the mode is steps', () => {
    expect(DAW_SETUPS.reaper.capabilities.stack_takes.mode).toBe('native');
    expect(stackOf(DAW_SETUPS.reaper, 2)).toEqual({ message: takesStackedAnswer(2, 'REAPER'), undoSteps: 1 });
    expect(stackOf(DAW_SETUPS.reaper, 1, true)).toEqual({ message: takesUnstackedAnswer(1, 'REAPER'), undoSteps: 1 });
    const withMode = (mode: 'steps' | 'app') => ({
      ...DAW_SETUPS.audacity,
      capabilities: { ...DAW_SETUPS.audacity.capabilities, stack_takes: { level: 'experimental' as const, available: true, mode } },
    });
    const steps = golden('daw-stack-steps.json');
    expect(stackOf(withMode('steps'), 1)).toEqual({ message: steps.message, undoSteps: steps.undoSteps, steps: steps.steps });
    expect(steps.steps).toEqual([...STACK_STEPS]);
    expect(stackOf(withMode('app'), 1).undoSteps).toBe(0);
  });
});
