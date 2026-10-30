import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { announceBrowserSettingChange } from '../../../browserSettings';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemePreference } from '../../../theme/theme';
import { useMotionPreference, type MotionPreference } from '../../../motion';
import { IconButton } from '../../primitives/IconButton';
import { RadioGroup } from '../../primitives/RadioGroup';
import { Select } from '../../primitives/Select';
import { InsetCard } from '../../primitives/InsetCard';
import { Slider } from '../../primitives/Slider';
import { READER_FONTS, READER_SIZES, READER_SPACING, READER_WIDTHS, fontStack, widthName } from '../../script/page/tools/text/readerText';
import { readScrollStep, SCROLL_STEP_MAX, SCROLL_STEP_MIN, writeScrollStep } from '../../editing/ribbon/scrollStep';
import { changeReaderText, useReaderText } from './readerText';
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

const MOTION_OPTIONS: { value: MotionPreference; label: string }[] = [
  { value: 'system', label: 'Follow Windows' },
  { value: 'reduce', label: 'Reduce' },
];

/** Motion: Follow Windows (its "Animation effects" setting) or Reduce, kept by this browser window (`useMotionPreference`). */
export function MotionRowBody() {
  const [preference, setPreference] = useMotionPreference();
  return <RadioGroup label="Motion" value={preference} onChange={setPreference} options={MOTION_OPTIONS} />;
}

// Reader text is four rows (alignment audit XSE2-13): each row's title names its control, so the controls carry no labels of their own, and
// each is a settings field wide. The preview quote, drawn in all four choices, sits under the last.
const READER_FIELD = 'w-full max-w-80';
const FONT_OPTIONS = READER_FONTS.map(([name]) => ({ value: name, label: name }));
const PREVIEW = '“Off with her head!” the Queen shouted at the top of her voice. Nobody moved.';

/** Reader font: the typeface of the manuscript in the Script reader and the Booth. */
export function ReaderFontBody() {
  const prefs = useReaderText();
  return <Select label="Reader font" value={prefs.font} onChange={(font) => changeReaderText({ font })} options={FONT_OPTIONS} className={READER_FIELD} />;
}

/** Reader text size: one of the reader's sizes, read out in px. */
export function ReaderSizeBody() {
  const prefs = useReaderText();
  return (
    <Slider
      aria-label="Reader text size"
      valueText={`${prefs.size} px`}
      min={0}
      max={READER_SIZES.length - 1}
      step={1}
      value={Math.max(0, READER_SIZES.indexOf(prefs.size))}
      onValueChange={(index) => changeReaderText({ size: READER_SIZES[index] })}
      className={READER_FIELD}
    />
  );
}

/** Waveform arrow step: 15 to 30 seconds, kept by this browser window and read by the Editing waveform's arrows at each press. */
export function WaveScrollStepBody() {
  const [seconds, setSeconds] = useState(readScrollStep);
  return (
    <Slider
      aria-label="Waveform arrow step"
      valueText={`${seconds} s`}
      min={SCROLL_STEP_MIN}
      max={SCROLL_STEP_MAX}
      step={1}
      value={seconds}
      onValueChange={(next) => {
        writeScrollStep(next);
        setSeconds(next);
      }}
      className={READER_FIELD}
    />
  );
}

/** Line spacing of the manuscript in the reader. */
export function ReaderSpacingBody() {
  const prefs = useReaderText();
  return (
    <Slider
      aria-label="Line spacing"
      valueText={prefs.spacing.toFixed(1)}
      min={READER_SPACING.min}
      max={READER_SPACING.max}
      step={READER_SPACING.step}
      value={prefs.spacing}
      onValueChange={(spacing) => changeReaderText({ spacing: +spacing.toFixed(1) })}
      className={READER_FIELD}
    />
  );
}

/** Column width of the reader, then the preview quote drawn in all four choices. */
export function ReaderWidthBody() {
  const prefs = useReaderText();
  return (
    <div className="flex w-full flex-col gap-3">
      <Slider
        aria-label="Column width"
        valueText={widthName(prefs.width)}
        min={0}
        max={READER_WIDTHS.length - 1}
        step={1}
        value={Math.max(
          0,
          READER_WIDTHS.findIndex(([, percent]) => percent === prefs.width),
        )}
        onValueChange={(index) => changeReaderText({ width: READER_WIDTHS[index]?.[1] })}
        className={READER_FIELD}
      />
      <InsetCard>
        <blockquote
          data-testid="reader-text-preview"
          className="m-0 text-[var(--text)]"
          style={{ fontFamily: fontStack(prefs.font), fontSize: `${prefs.size}px`, lineHeight: prefs.spacing }}
        >
          {PREVIEW}
        </blockquote>
      </InsetCard>
    </div>
  );
}

// The levels the host snaps to (src/studio/desktop/bindings_window.go's zoomSteps, as hooks/useZoom.ts lists them): 100% is the smallest
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
        announceBrowserSettingChange();
      })
      .catch((failure: unknown) => notify(apiErrorMessage(failure), 'error'));

  // A level under 100% (Ctrl + wheel) is shown as it is, though it is not one to choose.
  const levels = ZOOM_LEVELS.includes(level) ? ZOOM_LEVELS : [...ZOOM_LEVELS, level].sort((a, b) => a - b);
  return (
    <div className="flex flex-nowrap items-center gap-1.5">
      {/* A short value gets the settings' short field width, 8rem, not its 85 px content width (alignment audit XSE2-9, XSE2-33). */}
      <Select
        label="Zoom"
        className="w-32"
        value={String(level)}
        options={levels.map((value) => ({ value: String(value), label: percent(value) }))}
        onChange={(value) => choose(Number(value))}
      />
      {level !== 1 && <IconButton action="undo" label="Reset zoom to 100%" className="border-transparent" onClick={() => choose(1)} />}
    </div>
  );
}
