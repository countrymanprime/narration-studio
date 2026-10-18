import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemePreference } from '../../../theme/theme';
import { IconButton } from '../../primitives/IconButton';
import { RadioGroup } from '../../primitives/RadioGroup';
import { Select } from '../../primitives/Select';
import { ReaderTextBody } from '../page/ReaderTextPanel';
import { useTextPrefs } from '../../script/page/tools/text/useTextPrefs';
import { useSettingsHost } from '../row/SettingsHost';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Match my system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Theme: Match my system, Light or Dark, kept by this browser window (`useTheme`) and followed by the header's theme button. */
export function ThemeRowBody() {
  const { preference, setPreference } = useTheme();
  return <RadioGroup label="Theme" value={preference} onChange={setPreference} options={THEME_OPTIONS} />;
}

/** Reader text: the Script reader's font, size, line spacing and width (the same saved choices as the Script's text settings) and a quote drawn in them. */
export function ReaderTextRowBody() {
  const [prefs, change] = useTextPrefs();
  return <ReaderTextBody prefs={prefs} onChange={change} />;
}

// The levels the host snaps to (apps/desktop/bindings_window.go's zoomSteps, as hooks/useZoom.ts lists them): 100% is the smallest
// the header's buttons and Ctrl + minus reach, so the mock's 80% and 90% are not offered; the host would put them back to 100%.
const ZOOM_LEVELS = [1, 1.1, 1.25, 1.5, 1.75, 2];
const percent = (level: number): string => `${Math.round(level * 100)}%`;

/**
 * Zoom: a select over the host's zoom levels with a reset, setting the real window zoom (`windowSetZoom`, saved with `windowSaveZoom`). The
 * header's zoom chip and Ctrl + plus, minus and 0 change the same level, and the `resize` they cause updates this select.
 */
export function ZoomRowBody() {
  const system = usePort('system');
  const { notify } = useSettingsHost();
  const [level, setLevel] = useState(1);

  const read = useCallback(() => {
    void system
      .windowZoom()
      .then((result) => setLevel(result.level))
      .catch(() => undefined);
  }, [system]);
  useEffect(() => {
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [read]);

  const choose = (next: number) =>
    void system
      .windowSetZoom(next)
      .then(async (result) => {
        setLevel(result.level);
        await system.windowSaveZoom(result.level);
      })
      .catch((failure: unknown) => notify(apiErrorMessage(failure), 'error'));

  // A level under 100% (Ctrl + wheel) is shown as it is, though it is not one to choose.
  const levels = ZOOM_LEVELS.includes(level) ? ZOOM_LEVELS : [...ZOOM_LEVELS, level].sort((a, b) => a - b);
  return (
    <div className="flex flex-nowrap items-center gap-1.5">
      <Select
        label="Zoom"
        value={String(level)}
        options={levels.map((value) => ({ value: String(value), label: percent(value) }))}
        onChange={(value) => choose(Number(value))}
      />
      {level !== 1 && <IconButton action="undo" label="Reset zoom to 100%" className="border-transparent" onClick={() => choose(1)} />}
    </div>
  );
}
