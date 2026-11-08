import { useMemo } from 'react';
import { announceBrowserSettingChange } from '../../../browserSettings';
import type { PortOf } from '../../../ports';
import { usePort } from '../../../ports/usePort';
import { useMotionPreference } from '../../../motion';
import { useTheme } from '../../../theme/ThemeContext';
import { useTips } from '../../../tips/useFirstUseTip';
import { DEFAULT_BOOTH_SIZE, writeBoothSize } from '../../booth/page/boothSize';
import { writeStoredTakeTone } from '../../booth/takeTone';
import { writeScrollStep, SCROLL_STEP_DEFAULT } from '../../editing/ribbon/scrollStep';
import { DEFAULT_OUTPUT, useOutputPrefs } from '../../engine/outputPrefs';
import { useVoiceTracks } from '../../engine/useVoiceTracks';
import { DEFAULT_TEXT_PREFS } from '../../script/page/tools/text/readerText';
import { announceRateBasis } from '../../schedule/useEffectiveWph';
import { DEFAULT_SORT, saveEntrySort } from '../../storybible/entryTableModel';
import { refreshUserKeymap } from '../../../input/useUserKeymap';
import { DELIVERY_PROFILES_CHANGED, optionValue } from '../DeliveryProfilesPanel';
import { engineChanged } from './engineSignal';
import { changeReaderText } from '../controls/readerText';
import { useSettingsHost } from '../row/SettingsHost';
import { rowOf } from '../registry/rows';
import { useSettingsStore } from './SettingsStore';

/** Puts one row's value back to its default; a refusal rejects, and the caller says which rows could not be reset. */
export type RowReset = () => Promise<unknown> | void;

/** The rows `useRowResets` resets, in one list so a test can compare it with the rows Changed reads (they are the same rows). */
export const RESETTABLE_ROWS = [
  'look.theme',
  'look.motion',
  'look.waveScrollStep',
  'look.reader',
  'look.readerSize',
  'look.readerSpacing',
  'look.readerWidth',
  'look.boothSize',
  'look.playback',
  'look.entrySort',
  'daw.startTone',
  'look.zoom',
  'app.tips',
  'project.rateBasis',
  'daw.sync',
  'daw.layout',
  'keys.map',
  'daw.engine',
  'delivery.profile',
] as const;

/**
 * Rows Changed marks that the header Reset leaves to their own panel, each with why (a closed list: a test holds it to exactly these). Putting
 * them back is not a value write: it moves gigabytes, or erases what the narrator built, so it is asked for where that is shown.
 */
export const LEFT_TO_THEIR_PANEL: Readonly<Record<string, string>> = {
  'models.folder': 'Moving the downloads back copies gigabytes and asks first; its row has its own Reset, which does that.',
  'delivery.default':
    'The default profile for new projects is chosen in the Delivery list, beside the profiles it can point at; there is no one-press default.',
  'project.types': 'Resetting would drop the Story Bible types the narrator made, and the entries filed under them; its own panel renames and removes them.',
  'project.marks': 'Resetting would drop the mark types the narrator made, and the marks filed under them; its own panel renames and removes them.',
  'project.credits': 'Resetting would erase the credit templates and this project’s credit text the narrator wrote; its own panel edits and deletes them.',
};

/** Whether the header's Reset to defaults puts this row back: a row with a host field, or one `useRowResets` knows. */
export const isResettable = (row: { id: string; field?: unknown }): boolean => Boolean(row.field) || (RESETTABLE_ROWS as readonly string[]).includes(row.id);

/**
 * There is no call that clears a project's delivery profile, so the project takes the global default, which is what unchanged means. A global
 * default that is not in the list (removed meanwhile) cannot be chosen, so that is said instead of leaving the row Changed with nothing done.
 */
export async function deliveryProfileReset(delivery: Pick<PortOf<'deliveryProfiles'>, 'deliveryProfiles' | 'deliverySelectProfile'>): Promise<void> {
  const state = await delivery.deliveryProfiles();
  const base = state.profiles.find((profile) => optionValue(profile) === optionValue(state.globalDefault));
  if (!base) throw new Error('The global default profile is not in the list.');
  await delivery.deliverySelectProfile('project', base.id, base.builtIn ? base.version : '');
  window.dispatchEvent(new Event(DELIVERY_PROFILES_CHANGED));
}

/**
 * What the header's Reset to defaults does for a row that has no host field (a custom body, or a value this window keeps): the same setter
 * the row's own Reset uses, so the page, the row and the header agree. A row with a host field is reset by writing its default (`resetCategory`).
 */
export function useRowResets(): Readonly<Record<(typeof RESETTABLE_ROWS)[number], RowReset>> {
  const { setPreference } = useTheme();
  const [, setMotion] = useMotionPreference();
  const system = usePort('system');
  const chapterSync = usePort('chapterSync');
  const production = usePort('production');
  const dawChoice = usePort('dawChoice');
  const delivery = usePort('deliveryProfiles');
  const { reset: resetTips } = useTips();
  const { change: changeOutput } = useOutputPrefs();
  const { notify } = useSettingsHost();
  const store = useSettingsStore();
  const { setLayout } = useVoiceTracks(notify, { characters: false });
  return useMemo(
    () => ({
      'look.theme': () => setPreference('system'),
      'look.motion': () => setMotion('system'),
      'look.waveScrollStep': () => writeScrollStep(SCROLL_STEP_DEFAULT),
      'look.reader': () => changeReaderText({ font: DEFAULT_TEXT_PREFS.font }),
      'look.readerSize': () => changeReaderText({ size: DEFAULT_TEXT_PREFS.size }),
      'look.readerSpacing': () => changeReaderText({ spacing: DEFAULT_TEXT_PREFS.spacing }),
      'look.readerWidth': () => changeReaderText({ width: DEFAULT_TEXT_PREFS.width }),
      'look.boothSize': () => writeBoothSize(DEFAULT_BOOTH_SIZE),
      'look.playback': () => changeOutput(DEFAULT_OUTPUT),
      'look.entrySort': () => void saveEntrySort(DEFAULT_SORT),
      'daw.startTone': () => writeStoredTakeTone(false),
      'look.zoom': async () => {
        const result = await system.windowSetZoom(1);
        await system.windowSaveZoom(result.level);
        announceBrowserSettingChange();
      },
      'app.tips': async () => {
        const problem = await resetTips();
        if (problem) throw new Error(problem);
      },
      'project.rateBasis': async () => {
        const saved = await production.setProductionRateBasis('standard');
        announceRateBasis(saved.rateBasis);
      },
      'daw.sync': () => chapterSync.chapterSyncSetEnabled(true),
      'daw.layout': () => setLayout('flat'),
      // The shortcut list's own Reset all to defaults saves the default keymap; clearing the saved overrides is the same result.
      // Saved through the page's store, so its fields (which Changed reads) follow; the row has no field of its own.
      'keys.map': async () => {
        const row = rowOf('keys.map');
        if (row) await store.write({ ...row, field: { tool: 'Keymap', key: 'overrides' } }, 'global', null);
        refreshUserKeymap();
      },
      'daw.engine': async () => {
        await dawChoice.dawChoose('REAPER');
        engineChanged();
      },
      'delivery.profile': () => deliveryProfileReset(delivery),
    }),
    [setPreference, setMotion, store, system, chapterSync, production, dawChoice, delivery, resetTips, changeOutput, setLayout],
  );
}
