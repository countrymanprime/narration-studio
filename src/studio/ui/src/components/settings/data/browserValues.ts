import { DEFAULT_BOOTH_SIZE, readBoothSize } from '../../booth/page/boothSize';
import { DEFAULT_OUTPUT, readOutputPrefs } from '../../engine/outputPrefs';
import { readStoredTakeTone } from '../../booth/takeTone';
import { readScrollStep, SCROLL_STEP_DEFAULT } from '../../editing/ribbon/scrollStep';
import { DEFAULT_TEXT_PREFS, loadTextPrefs, type TextPrefs } from '../../script/page/tools/text/readerText';
import { readStoredMotion } from '../../../motion';
import { readStoredPreference } from '../../../theme/theme';

const readerDiffers = (field: keyof TextPrefs) => (): boolean => loadTextPrefs()[field] !== DEFAULT_TEXT_PREFS[field];

/**
 * For each row with `scope: 'browser'`: whether this window's stored choice differs from the default. The host knows nothing of these, so
 * the Changed filter, the category counts and `isAnyChanged` ask here instead. A browser row with no entry fails `browserValues.test.ts`.
 */
export const BROWSER_CHANGED: Readonly<Record<string, () => boolean>> = {
  'daw.startTone': readStoredTakeTone,
  'look.theme': () => readStoredPreference() !== 'system',
  'look.motion': () => readStoredMotion() !== 'system',
  'look.waveScrollStep': () => readScrollStep() !== SCROLL_STEP_DEFAULT,
  'look.reader': readerDiffers('font'),
  'look.readerSize': readerDiffers('size'),
  'look.readerSpacing': readerDiffers('spacing'),
  'look.readerWidth': readerDiffers('width'),
  'look.boothSize': () => readBoothSize() !== DEFAULT_BOOTH_SIZE,
  'look.playback': () => JSON.stringify(readOutputPrefs()) !== JSON.stringify(DEFAULT_OUTPUT),
};
