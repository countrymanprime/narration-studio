// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { act, useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { Finding } from '../../../api/contracts/findings';
import type { DawResult } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { overlay } from '../../../overlay/overlayService';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { createJournal } from '../../../studio/journal/createJournal';
import { drawSections } from '../drawer/drawerSections';
import type { CleanupDeps, RangeTrim } from './cleanupApply';
import { actionText, appliedLabel, levelOf, measureText, opSpec } from './cleanupOps';
import { cleanupRows, countsOf, noiseFloorOf, proposals, trimRange } from './cleanupRows';
import { FINDINGS, finding } from './cleanupFixtures';
import { CleanupTab } from './CleanupTab';
import { registerCleanupSection } from './registerCleanupSection';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ok = (changed = true): DawResult => ({ ok: true, changed, message: 'Done.', undoSteps: 1 });
const standard = {
  gaps: { limit: 1.2 },
  breaths: { above: -26, reduce: 9 },
  clicks: { above: -28 },
  plosives: { above: -14, reduce: 6 },
  noise: { above: -36, reduce: 12 },
};

describe('the operations and their levels', () => {
  it('levels-set-the-thresholds: each level matches its table row and edits make it custom', () => {
    expect(levelOf('breaths', { above: -26, reduce: 9 })).toBe('standard');
    expect(levelOf('breaths', { above: -20, reduce: 6 })).toBe('light');
    expect(levelOf('breaths', { above: -25, reduce: 9 })).toBeNull();
    expect(opSpec('gaps').levels.heavy).toEqual({ limit: 0.8 });
  });
  it('words a measure and a fix', () => {
    expect(measureText('gaps', { dur: 2.4 })).toBe('2.4 s');
    expect(measureText('clicks', { dur: 0.03, db: -20 })).toBe('−20 dB · 30 ms');
    expect(measureText('breaths', { dur: 0.4, db: -22 })).toBe('−22 dB · 0.4 s');
    expect(actionText('gaps', { limit: 1.2 })).toBe('Shorten to 1.2 s');
    expect(actionText('clicks', {})).toBe('Repair the click');
    expect(actionText('noise', { reduce: 12 })).toBe('Reduce by 12 dB');
    expect(appliedLabel('gaps', 3, {})).toBe('Shortened 3 gaps');
    expect(appliedLabel('plosives', 1, { reduce: 6 })).toBe('Softened 1 plosive by 6 dB');
  });
});

describe('rows come from findings and candidates', () => {
  it('shows a finding and a candidate of one sound once, and a done one as done', () => {
    const twin = [
      finding({ id: 'a', start: 10, end: 12.4, cls: 'silence' }),
      finding({ id: 'b', start: 10.01, end: 12.4, cls: 'silence', status: 'accepted' }),
    ];
    const rows = cleanupRows(twin, 'gaps');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ids).toEqual(['a', 'b']);
    expect(rows[0]?.done).toBe(true);
  });
  it('invents nothing: no finding means no row, and a dismissed one is not a row', () => {
    expect(cleanupRows([], 'gaps')).toEqual([]);
    expect(cleanupRows([finding({ id: 'x', start: 1, end: 5, cls: 'silence', status: 'dismissed' })], 'gaps')).toEqual([]);
  });
  it('counts the findings that pass and are not done, and lists them in time order', () => {
    expect(countsOf(FINDINGS, standard)).toEqual({ gaps: 2, breaths: 1, clicks: 1, plosives: 1, noise: 1 });
    expect(proposals(FINDINGS, 'gaps', { limit: 1.2 }).map((r) => r.sec)).toEqual([10, 50]);
    expect(proposals(FINDINGS, 'gaps', { limit: 0.5 }).map((r) => r.sec)).toEqual([10, 30, 50]);
  });
  it('the noise floor is the measurement the findings carry, or the reason', () => {
    expect(noiseFloorOf(FINDINGS)).toEqual({ ok: true, value: -58 });
    expect(noiseFloorOf([])).toMatchObject({ ok: false });
  });
  it('trims the part of a gap above what the level leaves', () => {
    const row = cleanupRows(FINDINGS, 'gaps')[0];
    expect(row && trimRange(row, { limit: 1.2 })).toEqual({ start: 11.2, end: 12.4 });
  });
});

let trim: ReturnType<typeof vi.fn<(t: RangeTrim) => Promise<DawResult>>>;
let record: ReturnType<typeof vi.fn<(t: RangeTrim, r: DawResult) => Promise<void>>>;
let toast: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  trim = vi.fn(async () => ok());
  record = vi.fn(async () => undefined);
  toast = vi.spyOn(overlay, 'toast').mockImplementation(() => undefined);
});

/** The page's playback, reduced to what Preview calls: it plays one range at a time and says whether it is playing. */
function fakePlayback() {
  const listeners = new Set<() => void>();
  const played: Array<[number, number | undefined]> = [];
  const stop = vi.fn();
  let playing = false;
  const set = (on: boolean) => {
    playing = on;
    listeners.forEach((l) => l());
  };
  return {
    played,
    stop,
    subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
    get playing() {
      return playing;
    },
    playFrom: (from: number, to?: number) => {
      played.push([from, to]);
      set(true);
    },
    halt: () => {
      stop();
      set(false);
    },
    /** The range that was playing reaches its end. */
    finish: () => act(() => set(false)),
  };
}
type FakePlayback = ReturnType<typeof fakePlayback>;

function Host({ journal, deps, fake }: { journal: ReturnType<typeof createJournal>; deps: CleanupDeps | undefined; fake: FakePlayback | undefined }) {
  const playing = useSyncExternalStore(fake?.subscribe ?? (() => () => undefined), () => fake?.playing ?? false);
  const playback = fake ? { playing, playFrom: fake.playFrom, stop: fake.halt } : undefined;
  return <CleanupTab chapterId="5" journal={journal} {...(deps ? { deps } : {})} {...(playback ? { playback } : {})} />;
}

function mount(opts: { setup?: DawSetupId; findings?: Finding[]; deps?: CleanupDeps | null; playback?: FakePlayback } = {}) {
  const setup = DAW_SETUPS[opts.setup ?? 'reaper'];
  const daw = createMockDawClient(setup, { chapterIds: ['5'], candidateIds: [], findingIds: [] });
  const base = createMockApi();
  const findings = opts.findings ?? FINDINGS;
  const api = {
    ...base,
    findingsList: vi.fn(async () => ({ findings, total: findings.length })),
    editingCandidates: vi.fn(async () => findings.filter((f) => f.analyzer === 'editing')),
    dawCapabilities: async () => setup,
  };
  const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });
  const deps = opts.deps === null ? undefined : (opts.deps ?? { trim, record });
  render(
    <ApiProvider api={api as typeof base}>
      <PortOverrides clients={{ daw }}>
        <main>
          <Host journal={journal} deps={deps} fake={opts.playback} />
        </main>
      </PortOverrides>
    </ApiProvider>,
  );
  return { journal, api };
}

const chip = (name: RegExp) => screen.getByRole('button', { name });

describe('the Clean up tab', () => {
  it('operation-filter-with-counts: five chips with counts; the chosen one lists in time order with measure and fix', async () => {
    mount();
    await screen.findByRole('button', { name: /^Gaps 2/ });
    for (const n of [/^Breaths 1/, /^Clicks 1/, /^Plosives 1/, /^Noise 1/]) expect(chip(n)).toBeTruthy();
    const times = within(screen.getByRole('table', { name: 'Gaps found' })).getAllByText(/^\d+:\d\d$/);
    expect(times.map((t) => t.textContent)).toEqual(['0:10', '0:50']);
    expect(screen.getAllByText('Shorten to 1.2 s')).toHaveLength(2);
    fireEvent.click(chip(/^Breaths/));
    expect(await screen.findByText('−22 dB · 0.4 s')).toBeTruthy();
    expect(screen.getByText('Reduce by 9 dB')).toBeTruthy();
  });

  it('levels-set-the-thresholds-and-advanced-edits-them', async () => {
    mount();
    await screen.findByRole('button', { name: /^Gaps 2/ });
    fireEvent.click(screen.getByRole('button', { name: 'Heavy' }));
    expect(chip(/^Gaps 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Advanced/ }));
    const field = screen.getByRole('textbox', { name: 'Longest gap left (s)' });
    expect((field as HTMLInputElement).value).toBe('0.8');
    expect(screen.getByText(/0.2 to 5/)).toBeTruthy();
    fireEvent.change(field, { target: { value: '2.5' } });
    expect(chip(/^Gaps 1/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Custom' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('says so when no finding passes the thresholds', async () => {
    mount({ findings: [] });
    expect(await screen.findByText('No finding passes these thresholds.')).toBeTruthy();
  });

  it('preview-before-apply: Preview lists the pieces, the length, the Cuts track and the undo sentence, and calls nothing', async () => {
    mount();
    await screen.findByRole('button', { name: /^Gaps 2/ });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const preview = screen.getByRole('region', { name: 'Preview' });
    expect(within(preview).getByText(/2 gaps · 3 s/)).toBeTruthy();
    expect(within(preview).getByText(/the muted Cuts track/)).toBeTruthy();
    expect(within(preview).getByText(/Edit > Undo in REAPER/)).toBeTruthy();
    expect(trim).not.toHaveBeenCalled();
  });

  it('apply-is-one-daw-change-and-one-undo: trims each selected finding to the Cuts track and records it', async () => {
    const { journal } = mount();
    await screen.findByRole('button', { name: /^Gaps 2/ });
    fireEvent.click(screen.getByRole('checkbox', { name: '0:50' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 selected' }));
    await waitFor(() => expect(trim).toHaveBeenCalledTimes(1));
    expect(trim).toHaveBeenCalledWith({ chapterId: '5', itemGuid: 'item-1', start: 11.2, end: 12.4, mode: 'mute' });
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    const entries = await journal.entries();
    expect(entries.map((e) => e.label)).toEqual(['Shortened 1 gap']);
  });

  it('none selected applies nothing', async () => {
    mount();
    await screen.findByRole('button', { name: /^Gaps 2/ });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select every finding' }));
    const apply = screen.getByRole('button', { name: 'Apply to 0 selected' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(trim).not.toHaveBeenCalled();
  });

  it('stale-and-refused-rows-are-reported-not-guessed', async () => {
    trim.mockResolvedValueOnce({ ok: false, changed: false, message: 'gone', undoSteps: 0, refused: 'gone', code: 'stale' });
    const { journal } = mount({ findings: [...FINDINGS, finding({ id: 'noitem', start: 70, end: 75, cls: 'silence', item: null })] });
    await screen.findByRole('button', { name: /^Gaps 3/ });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 3 selected' }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(trim).toHaveBeenCalledTimes(2);
    expect(toast.mock.calls[0]?.[0]).toMatch(/Hid 1 .* 2 no longer matched an item and were left alone/);
    expect((await journal.entries()).length).toBe(1);
  });

  it('a DAW refusal changes nothing and shows its sentence', async () => {
    trim.mockResolvedValue({ ok: false, changed: false, message: 'The take is being recorded.', undoSteps: 0, refused: 'The take is being recorded.' });
    const { journal } = mount();
    await screen.findByRole('button', { name: /^Gaps 2/ });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 2 selected' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('The take is being recorded.', { tone: 'error' }));
    expect(record).not.toHaveBeenCalled();
    expect(await journal.entries()).toEqual([]);
  });

  it('no-apply-with-the-daw-off: Apply is disabled with the reason; Preview still lists', async () => {
    mount({ setup: 'reaper-off' });
    await screen.findByRole('button', { name: /^Gaps 2/ });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Apply to 2 selected' }) as HTMLButtonElement).disabled).toBe(true));
    expect(document.getElementById('cleanup-note')?.textContent?.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('region', { name: 'Preview' })).toBeTruthy();
  });

  it('operations-without-a-daw-command-are-disabled-with-a-reason', async () => {
    mount();
    await screen.findByRole('button', { name: /^Gaps 2/ });
    for (const name of [/^Breaths/, /^Clicks/, /^Plosives/, /^Noise/]) {
      fireEvent.click(chip(name));
      expect(await screen.findByText('No DAW command for this yet')).toBeTruthy();
      expect((screen.getByRole('button', { name: /^Apply to/ }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('noise-floor-is-shown-beside-the-noise-operation, or Not measured with the reason', async () => {
    mount();
    await screen.findByRole('button', { name: /^Gaps 2/ });
    expect(screen.queryByText('Chapter noise floor')).toBeNull();
    fireEvent.click(chip(/^Noise/));
    expect(screen.getByText('-58 dBFS')).toBeTruthy();
    cleanup();
    mount({ findings: FINDINGS.filter((f) => f.id !== 'n1') });
    await screen.findByRole('button', { name: /^Gaps 2/ });
    fireEvent.click(chip(/^Noise/));
    expect(screen.getByText(/^Not measured: /)).toBeTruthy();
  });

  it('Apply stays off with the reason when the page lends no trim', async () => {
    mount({ deps: null });
    await screen.findByRole('button', { name: /^Gaps 2/ });
    await waitFor(() => expect((screen.getByRole('button', { name: /^Apply to/ }) as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByText('The DAW cannot trim ranges here yet.')).toBeTruthy();
  });

  it('has no axe violations', async () => {
    mount();
    await screen.findByRole('button', { name: /^Gaps 2/ });
    const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('Preview plays the findings', () => {
  const FOUR = [...FINDINGS, finding({ id: 'g4', start: 70, end: 74, cls: 'silence' })];

  it('Preview plays the first three selected with two seconds around each', async () => {
    const fake = fakePlayback();
    mount({ findings: FOUR, playback: fake });
    await screen.findByRole('button', { name: /^Gaps 3/ });
    fireEvent.click(screen.getByRole('button', { name: 'Heavy' }));
    await screen.findByRole('button', { name: 'Apply to 4 selected' });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(fake.played).toEqual([[8, 14.4]]);
    expect(screen.getByText('Playing the first 3 of 4 selected, with 2 s before and after.')).toBeTruthy();
    fake.finish();
    expect(fake.played).toEqual([
      [8, 14.4],
      [28, 32.8],
    ]);
    fake.finish();
    expect(fake.played).toEqual([
      [8, 14.4],
      [28, 32.8],
      [48, 55],
    ]);
    fake.finish();
    expect(fake.played).toHaveLength(3);
    expect(screen.queryByText(/^Playing the first/)).toBeNull();
    expect(screen.getByRole('region', { name: 'Preview' })).toBeTruthy();
    expect(trim).not.toHaveBeenCalled();
  });

  it('leaves out what is skipped, and starts no earlier than zero', async () => {
    const fake = fakePlayback();
    mount({ findings: [finding({ id: 'a', start: 1, end: 4, cls: 'silence' }), ...FINDINGS], playback: fake });
    await screen.findByRole('button', { name: /^Gaps 3/ });
    fireEvent.click(screen.getByRole('checkbox', { name: '0:10' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(fake.played).toEqual([[0, 6]]);
    fake.finish();
    expect(fake.played[1]).toEqual([48, 55]);
  });

  it('Stop and Escape stop the preview, and no playback says why', async () => {
    const fake = fakePlayback();
    mount({ findings: FOUR, playback: fake });
    await screen.findByRole('button', { name: /^Gaps 3/ });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop preview' }));
    expect(fake.stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/^Playing the first/)).toBeNull();
    fake.finish();
    expect(fake.played).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(fake.stop).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy();
    cleanup();

    mount({ findings: FOUR });
    await screen.findByRole('button', { name: /^Gaps 3/ });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('region', { name: 'Preview' })).toBeTruthy();
    expect(screen.getByText('Nothing can play here: this page has no playback.')).toBeTruthy();
  });
});

describe('the drawer section', () => {
  it('registers in the Clean up tab and removes itself', () => {
    const off = registerCleanupSection({ journal: createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' }) });
    const doc = { paras: [], counts: { extra: 0, miss: 0, mis: 0, low: 0 } } as never;
    expect(drawSections('cleanup', { doc, chapterId: '5' }).map((d) => d.section.label)).toContain('Clean up findings');
    expect(drawSections('effects', { doc, chapterId: '5' })).toEqual([]);
    off();
    expect(drawSections('cleanup', { doc, chapterId: '5' })).toEqual([]);
  });
});
