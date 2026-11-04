import { useMemo } from 'react';
import { announceBrowserSettingChange } from '../../../browserSettings';
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
import { DEFAULT_SORT, saveEntrySort } from '../../storybible/entryTable';
import { refreshUserKeymap } from '../../../input/useUserKeymap';
import { DELIVERY_PROFILES_CHANGED, optionValue } from '../DeliveryProfilesPanel';
import { engineChanged } from './engineSignal';
import { changeReaderText } from '../controls/readerText';
import { useSettingsHost } from '../row/SettingsHost';

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

/** Whether the header's Reset to defaults puts this row back: a row with a host field, or one `useRowResets` knows. */
export const isResettable = (row: { id: string; field?: unknown }): boolean => Boolean(row.field) || (RESETTABLE_ROWS as readonly string[]).includes(row.id);

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
      'keys.map': async () => {
        await system.saveSettings('Keymap', 'global', { overrides: null });
        refreshUserKeymap();
      },
      'daw.engine': async () => {
        await dawChoice.dawChoose('REAPER');
        engineChanged();
      },
      // There is no call that clears a project's profile, so the project takes the global default, which is what unchanged means.
      'delivery.profile': async () => {
        const state = await delivery.deliveryProfiles();
        const base = state.profiles.find((profile) => optionValue(profile) === optionValue(state.globalDefault));
        if (!base) return;
        await delivery.deliverySelectProfile('project', base.id, base.builtIn ? base.version : '');
        window.dispatchEvent(new Event(DELIVERY_PROFILES_CHANGED));
      },
    }),
    [setPreference, setMotion, system, chapterSync, production, dawChoice, delivery, resetTips, changeOutput, setLayout],
  );
}
