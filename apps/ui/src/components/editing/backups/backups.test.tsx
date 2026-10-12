// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities, DawResult } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { OverlayHost } from '../../../overlay/OverlayHost';
import { overlay } from '../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { createJournal, type Journal } from '../../../studio/journal/createJournal';
import { drawSections } from '../drawer/drawerSections';
import { tabsFor } from '../drawer/drawerTabs';
import { summarize } from '../model';
import { cutPlanText } from '../range/common/rangePlan';
import { fakeCutLog, locator } from '../range/cut/cutFixtures';
import { beforeCut, cutCommand } from '../range/cut/cutCommand';
import { applyFxCommand, beforeFx } from '../range/fx/fxCommand';
import { marksDoc } from '../script/scriptFixtures';
import { beforeStack, stackCommand } from '../stack/stackCommand';
import { fakeStackLog } from '../stack/stackFixtures';
import { installBackupSteps, type BackupPlaces } from './backupBefore';
import { BackupsTab } from './BackupsTab';
import { withBackupSettings } from './backupsFixtures';
import { NO_BACKUP } from './backupsText';
import { keepsBackups, registerBackupsSection } from './registerBackupsSection';
import { RETENTION_KEY, WINDOW_KEY } from './useBackupSettings';

const CHAPTER = 'chapter-1';
const places: BackupPlaces = { locator: () => locator, tokensIn: (_c, span) => ({ firstToken: Math.floor(span.start), lastToken: Math.ceil(span.end) }) };

let journal: Journal;
let calls: string[];

beforeEach(() => {
  journal = createJournal({ dawName: () => 'Audacity', dawLastAction: async () => 'unknown' });
  calls = [];
  beforeCut.length = 0;
  beforeFx.length = 0;
  beforeStack.length = 0;
});
afterEach(() => {
  overlay.getSnapshot().toasts.forEach((t) => overlay.dismissToast(t.id));
  cleanup();
  vi.restoreAllMocks();
});

/** A mock DAW client that writes down every call by name. */
function spyDaw(setup: DawCapabilities, over: Partial<DawClient> = {}): DawClient {
  const base = { ...createMockDawClient(setup), ...over };
  return new Proxy(base, {
    get(target, key: string) {
      const value = target[key as keyof DawClient];
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => (calls.push(key), (value as (...a: unknown[]) => unknown)(...args));
    },
  });
}

const flush = () => act(async () => {});
const toasts = () => overlay.getSnapshot().toasts.map((t) => t.text);
const rows = () => [...document.querySelectorAll('tbody tr')];

function mount(daw: DawClient, api = withBackupSettings(createMockApi())) {
  return render(
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw }}>
        <BackupsTab chapterId={CHAPTER} chapterName="Chapter 1" total={600} journal={journal} />
        <OverlayHost />
      </PortOverrides>
    </ApiProvider>,
  );
}

const backUp = (daw: DawClient, label: string, firstToken = 0, lastToken = 1) => daw.backupAround({ chapterId: CHAPTER, firstToken, lastToken, label });

describe('the Backups tab', () => {
  it('tab-only-for-daws-with-the-capability: the section registers only where the DAW keeps backups (Audacity, on or turned off); REAPER and the recorder never', () => {
    const ids: DawSetupId[] = ['reaper', 'builtin', 'audacity', 'audacity-backups'];
    const offered = ids.map((id) => keepsBackups(DAW_SETUPS[id]));
    expect(offered).toEqual([false, false, true, true]);
    expect(tabsFor(offered[0]!, true).map(([k]) => k)).toEqual(['cleanup', 'effects']);
    expect(tabsFor(offered[2]!, true).map(([k]) => k)).toEqual(['cleanup', 'effects', 'backups']);
    const props = { chapterName: 'Chapter 1', total: 600, journal };
    const context = { doc: marksDoc(), chapterId: CHAPTER };
    for (const id of ids.slice(0, 2)) {
      const off = registerBackupsSection(DAW_SETUPS[id], props);
      expect(drawSections('backups', context)).toHaveLength(0);
      off();
    }
    const remove = registerBackupsSection(DAW_SETUPS['audacity-backups'], props);
    expect(drawSections('backups', context).map((d) => d.section.label)).toEqual(['Backups']);
    remove();
    expect(drawSections('backups', context)).toHaveLength(0);
  });

  it('list-newest-first-with-label-range-and-date: each row has its label, the stretch it cloned, when, and Put this back; none says so', async () => {
    const daw = spyDaw(DAW_SETUPS['audacity-backups']);
    mount(daw);
    await flush();
    expect(screen.getByRole('heading', { name: 'No backups yet.' })).toBeTruthy();
    cleanup();
    await backUp(daw, 'Delete words', 130, 131);
    await backUp(daw, 'Roll at ¶ 3', 200, 210);
    mount(daw);
    await flush();
    const [first, second] = rows();
    expect(first!.textContent).toContain('Roll at ¶ 3');
    expect(first!.textContent).toContain('1:20–5:31');
    expect(first!.textContent).toContain('Oct 12');
    expect(first!.textContent).toContain('Kept');
    expect(second!.textContent).toContain('Delete words');
    expect(first!.querySelector('[data-bkrestore]')!.getAttribute('aria-label')).toBe('Put this back');
  });

  it('restore-is-one-undo-step-or-a-reason: Put this back is one history entry the app cannot undo; a clone the DAW no longer holds is refused and shown missing', async () => {
    const daw = spyDaw(DAW_SETUPS['audacity-backups']);
    await backUp(daw, 'Roll at ¶ 3');
    mount(daw);
    await flush();
    const id = document.querySelector('[data-bkrestore]')!.getAttribute('data-bkrestore')!;
    await act(async () => void fireEvent.click(document.querySelector(`[data-bkrestore="${id}"]`)!));
    await flush();
    expect(calls.filter((c) => c === 'restoreBackup')).toHaveLength(1);
    const entries = await journal.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ label: 'Put back Roll at ¶ 3', daw: true, undoable: false });
    expect(toasts().at(-1)).toMatch(/^Restored .* This cannot be undone here: undo it in Audacity\.$/);
    expect(rows()[0]!.textContent).toMatch(/Put back Oct 12/);

    cleanup();
    const gone = 'Audacity has no backup with that id.';
    const refusing = spyDaw(DAW_SETUPS['audacity-backups'], {
      backups: daw.backups,
      restoreBackup: async (): Promise<DawResult> => ({ ok: false, changed: false, message: gone, undoSteps: 0, refused: gone }),
    });
    mount(refusing);
    await flush();
    await act(async () => void fireEvent.click(document.querySelector('[data-bkrestore]')!));
    await flush();
    expect(toasts()).toContain(gone);
    expect(rows()[0]!.textContent).toContain('Missing');
    expect(await journal.entries()).toHaveLength(1);
  });

  it('settings-window-and-retention: the values and their limits are the settings port’s, and a change is saved through it', async () => {
    const api = withBackupSettings(createMockApi(), { [WINDOW_KEY]: '90' });
    const real = api.settingsForScope;
    api.settingsForScope = async (scope) => {
      const fields = await real(scope);
      return { ...fields, DAW: fields.DAW!.map((f) => (f.key === WINDOW_KEY ? { ...f, number: { min: 10, max: 200, step: 10, unit: 's' } } : f)) };
    };
    const save = vi.spyOn(api, 'saveSettings');
    mount(spyDaw(DAW_SETUPS['audacity-backups']), api);
    await flush();
    const win = document.querySelector('[data-bkwin]') as HTMLInputElement;
    const keep = document.querySelector('[data-bkkeep]') as HTMLInputElement;
    expect(win.value).toBe('90');
    expect(keep.value).toBe('7');
    fireEvent.change(win, { target: { value: '999' } });
    fireEvent.blur(win);
    expect(save).toHaveBeenLastCalledWith('DAW', 'project', { [WINDOW_KEY]: '200' });
    fireEvent.change(keep, { target: { value: '3' } });
    expect(save).toHaveBeenLastCalledWith('DAW', 'project', { [RETENTION_KEY]: '3' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep backups' }));
    expect(save).toHaveBeenLastCalledWith('DAW', 'project', { 'capability.backups': 'off' });
  });

  it('opening-the-tab-only-reads: the tab reads the table and asks the DAW to change nothing; the host prunes on project open', async () => {
    mount(spyDaw(DAW_SETUPS['audacity-backups']));
    await flush();
    expect(new Set(calls)).toEqual(new Set(['capabilities', 'backups']));
  });

  it('atlas-and-axe: the tab with backups has no violations', async () => {
    const daw = spyDaw(DAW_SETUPS['audacity-backups']);
    await backUp(daw, 'Roll at ¶ 3');
    const { container } = mount(daw);
    await flush();
    fireEvent.click(rows()[0]!);
    await flush();
    expect(screen.getByRole('region', { name: 'Backup settings' }).textContent).toContain('of 10:00');
    const result = await axe.run(container);
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('a backup before each edit', () => {
  const sum = () => summarize(marksDoc(), ['p-1:0', 'p-1:1'], [], (t) => t);
  const audacityPlan = { kind: 'backup-then-daw', dawName: 'Audacity', steps: 2 } as const;
  const ok: DawResult = { ok: true, changed: true, message: 'Done.', undoSteps: 1 };

  const cut = (daw: DawClient) =>
    cutCommand({ daw, log: fakeCutLog(), onCuts: () => {} }, audacityPlan, {
      chapterId: CHAPTER,
      summary: sum(),
      options: { mode: 'close', fadeMs: 12 },
      mute: false,
      locator,
    });
  const fx = (daw: DawClient) =>
    applyFxCommand(
      {
        daw,
        log: { editingWordFxRecord: async (chapterId) => ({ chapterId, effects: [], changed: ['fx1'], over: [] }), editingWordFxRemove: vi.fn() },
        onEffects: () => {},
      },
      audacityPlan,
      { chapterId: CHAPTER, range: sum().ranges[0]!, chain: { id: 'x', name: 'x' }, source: 'Effects', locator, needsOver: false, confirmedOver: false },
    );
  const stack = (daw: DawClient) =>
    stackCommand(
      { daw, log: fakeStackLog(), onChange: () => {} },
      { kind: 'steps', dawName: 'Audacity', steps: ['Split', 'Move'] },
      { chapterId: CHAPTER, plan: { groups: [], takes: 1, shift: 0, region: { start: 10, end: 65 } } },
    );

  it('backup-first-for-each-edit: with backups the delete, the effect and the stack back up before the DAW is asked, and the dialog says so', async () => {
    const daw = spyDaw(DAW_SETUPS['audacity-backups'], { deleteRange: async () => ok, applyFxToRange: async () => ok, stackTakes: async () => ok });
    const off = installBackupSteps(daw, places);
    for (const [command, edit] of [
      [cut, 'deleteRange'],
      [fx, 'applyFxToRange'],
      [stack, 'stackTakes'],
    ] as const) {
      calls = [];
      expect((await command(daw).run()).ok).toBe(true);
      expect(calls.filter((c) => c !== 'backups')).toEqual(['backupAround', edit]);
    }
    expect(cutPlanText(audacityPlan, false)).toContain('backs up the stretch first');
    off();
    expect([beforeCut, beforeFx, beforeStack].map((l) => l.length)).toEqual([0, 0, 0]);
  });

  it('a failed backup stops the edit with nothing changed, and a DAW without backups is refused with its own sentence', async () => {
    const broken = spyDaw(DAW_SETUPS['audacity-backups'], {
      backupAround: async () => ({ ok: false, changed: false, message: 'Audacity did not answer.', undoSteps: 0, refused: 'Audacity did not answer.' }),
    });
    installBackupSteps(broken, places);
    const failed = await cut(broken).run();
    expect(failed).toMatchObject({ ok: false, refusal: { reason: `${NO_BACKUP} Audacity did not answer.` } });
    expect(calls).not.toContain('deleteRange');
    [beforeCut, beforeFx, beforeStack].forEach((l) => (l.length = 0));

    calls = [];
    const without = spyDaw(DAW_SETUPS.audacity);
    installBackupSteps(without, places);
    const refused = await fx(without).run();
    expect(refused).toMatchObject({ ok: false, refusal: { reason: `${NO_BACKUP} Turned off in Settings.` } });
    expect(calls).toEqual(['backupAround']);
  });

  it('a DAW that keeps no backups takes none: REAPER’s delete never asks for one', async () => {
    const daw = spyDaw(DAW_SETUPS.reaper, { deleteRange: async () => ok });
    installBackupSteps(daw, places);
    const done = await cutCommand(
      { daw, log: fakeCutLog(), onCuts: () => {} },
      { kind: 'daw', dawName: 'REAPER' },
      {
        chapterId: CHAPTER,
        summary: sum(),
        options: { mode: 'close', fadeMs: 12 },
        mute: false,
        locator,
      },
    ).run();
    expect(done.ok).toBe(true);
    expect(calls).toEqual(['deleteRange']);
  });

  it('window-never-passes-the-audio-there-is: the page sends only the words, and the DAW adds the window inside the audio there is', async () => {
    const daw = spyDaw(DAW_SETUPS['audacity-backups'], { deleteRange: async () => ok, stackTakes: async () => ok });
    const sent = vi.spyOn(daw, 'backupAround');
    installBackupSteps(daw, places);
    await cut(daw).run();
    expect(sent).toHaveBeenLastCalledWith({ chapterId: CHAPTER, firstToken: 0, lastToken: 1, label: 'Deleted 2 words and their audio at 0:00' });
    await stack(daw).run();
    expect(sent).toHaveBeenLastCalledWith({ chapterId: CHAPTER, firstToken: 10, lastToken: 65, label: 'Stack retries as takes' });
    const [row] = await daw.backups();
    expect(row!.start).toBe(0);
  });
});
