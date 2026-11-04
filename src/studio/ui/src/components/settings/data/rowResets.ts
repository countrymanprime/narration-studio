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
import { changeReaderText } from '../controls/readerText';
import { useSettingsHost } from '../row/SettingsHost';

/** Puts one row's value back to its default; a refusal rejects, and the caller says which rows could not be reset. */
export type RowReset = () => Promise<unknown> | void;

/**
 * Changed rows the header's Reset to defaults leaves alone, each with why. They hold something the narrator entered or chose, not a value
 * with a default the app can restore, so each is undone in its own row. Changed still counts them. `rowResets.test.ts` fails for a Changed
 * row that is in neither this list nor `useRowResets`, and for an entry here that has a reset or is not Changed-readable, so the list only
 * shrinks.
 */
export const RESET_BY_ROW: Readonly<Record<string, string>> = {
  'daw.voices': 'Which character each voice track records is project data the narrator entered; it is changed in its own row, track by track.',
  'delivery.custom': 'The narrator’s own delivery profiles are data they wrote; each is deleted in the profile list.',
  'voice.mwKey': 'The Merriam-Webster key is a secret the narrator pasted; it is removed in its own row, which asks first.',
  'keys.map': 'The shortcut list has its own Reset all to defaults, which asks first and can be undone command by command.',
  'daw.engine': 'Which recording tool the project uses is a choice that starts or stops tools; it is changed in its own row.',
  'delivery.profile': 'The project’s own delivery profile is chosen in its own row.',
};

/** The rows `useRowResets` resets, in one list so a test can compare it with the rows Changed reads. */
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
    }),
    [setPreference, setMotion, system, chapterSync, production, resetTips, changeOutput, setLayout],
  );
}
