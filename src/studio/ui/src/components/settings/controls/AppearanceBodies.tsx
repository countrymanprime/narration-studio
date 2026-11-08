import { useCallback, useEffect, useState } from 'react';
import { ZOOM_STEPS } from '../../../hooks/useZoom';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { announceBrowserSettingChange, useBrowserSetting, useBrowserSettingsVersion } from '../../../browserSettings';
import { useTheme } from '../../../theme/ThemeContext';
import type { ThemePreference } from '../../../theme/theme';
import { useMotionPreference, type MotionPreference } from '../../../motion';
import { IconButton } from '../../primitives/IconButton';
import { RadioGroup } from '../../primitives/RadioGroup';
import { Select } from '../../primitives/Select';
import { retryAction } from '../../primitives/Toast';
import { InsetCard } from '../../primitives/InsetCard';
import { Button } from '../../primitives/Button';
import { Checkbox } from '../../primitives/Checkbox';
import { Slider } from '../../primitives/Slider';
import { ToggleGroup } from '../../primitives/ToggleGroup';
import { READER_FONTS, READER_SIZES, READER_SPACING, READER_WIDTHS, fontStack, widthName } from '../../script/page/tools/text/readerText';
import { readScrollStep, SCROLL_STEP_MAX, SCROLL_STEP_MIN, writeScrollStep } from '../../editing/ribbon/scrollStep';
import { readBoothSize, writeBoothSize } from '../../booth/page/boothSize';
import { DEFAULT_SORT, ENTRY_SORT_STORAGE_KEY, loadEntrySort, saveEntrySort, type ColumnKey } from '../../storybible/entryTableModel';
import { RATES, rateLabel, useOutputPrefs } from '../../engine/outputPrefs';
import { DeviceRow } from '../../editing/output/OutputControls';
import { useOutputDevices } from '../../editing/output/useOutputDevices';
import { TEXT_SIZE, textSizePx } from '../../booth/reading/BoothText';
import { changeReaderText, useReaderText } from './readerText';
import { useSettingsHost } from '../row/SettingsHost';
import { useTips } from '../../../tips/useFirstUseTip';

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
  const [seconds, setSeconds] = useBrowserSetting(readScrollStep);
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

/** Booth text size: 24 to 72 px in steps of 4, kept by this browser window and read by the Booth; the Booth's Text settings write the same size. */
export function BoothTextSizeBody() {
  const [size, setSize] = useBrowserSetting(readBoothSize);
  return (
    <Slider
      aria-label="Booth text size"
      valueText={`${size} px`}
      min={TEXT_SIZE.min}
      max={TEXT_SIZE.max}
      step={TEXT_SIZE.step}
      value={size}
      onValueChange={(next) => {
        // Page Up and Page Down step by 10, which is not a size: take the nearest one.
        const chosen = textSizePx(next);
        writeBoothSize(chosen);
        setSize(chosen);
      }}
      className={READER_FIELD}
    />
  );
}

/**
 * Editing playback: the speed, volume, silence and output device of the sound the Editing page plays, the same choices its Output popover makes,
 * kept by this browser window. The Editing page reads them when it opens.
 */
export function PlaybackBody() {
  const { prefs, change } = useOutputPrefs();
  const { listing, refresh } = useOutputDevices();
  return (
    <div className={`flex flex-col gap-3 ${READER_FIELD}`}>
      <ToggleGroup
        label="Playback speed"
        look="segmented"
        value={String(prefs.rate)}
        onChange={(rate) => change({ rate: Number(rate) })}
        options={RATES.map((rate) => ({ value: String(rate), label: rateLabel(rate) }))}
      />
      <Slider
        aria-label="Playback volume"
        valueText={`${prefs.volume}%`}
        min={0}
        max={100}
        step={1}
        value={prefs.volume}
        onValueChange={(volume) => change({ volume })}
      />
      <Checkbox checked={prefs.muted} onChange={(muted) => change({ muted })}>
        Silence playback
      </Checkbox>
      <DeviceRow prefs={prefs} devices={listing} deviceProblem={null} onChange={change} onCheckDevices={refresh} heading={false} />
    </div>
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

// The levels are hooks/useZoom.ts's ZOOM_STEPS, the host's zoomSteps: 100% is the smallest the header's buttons and Ctrl + minus reach, so the
// mock's 80% and 90% are not offered; the host would put them back to 100%.
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
  // Read again when a window-kept write is announced too (the header's Reset to defaults sets the zoom through the host, not the resize).
  const browserVersion = useBrowserSettingsVersion();
  useEffect(() => {
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [read, browserVersion]);

  // A failed set or save is an error toast with Retry: setting the same level and saving it again writes the same value (issue #2919).
  const choose = (next: number): void =>
    void system
      .windowSetZoom(next)
      .then(async (result) => {
        setLevel(result.level);
        await system.windowSaveZoom(result.level);
        announceBrowserSettingChange();
      })
      .catch((failure: unknown) =>
        notify(
          apiErrorMessage(failure),
          'error',
          retryAction(() => choose(next)),
        ),
      );

  // A level under 100% (Ctrl + wheel) is shown as it is, though it is not one to choose.
  const levels = ZOOM_STEPS.includes(level) ? ZOOM_STEPS : [...ZOOM_STEPS, level].sort((a, b) => a - b);
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

const ENTRY_ORDERS: { value: string; label: string; key: { column: ColumnKey; dir: 'asc' | 'desc' } }[] = [
  { value: 'name-asc', label: 'Name, A to Z', key: { column: 'name', dir: 'asc' } },
  { value: 'name-desc', label: 'Name, Z to A', key: { column: 'name', dir: 'desc' } },
  { value: 'kind-asc', label: 'Kind, first to last', key: { column: 'kind', dir: 'asc' } },
  { value: 'kind-desc', label: 'Kind, last to first', key: { column: 'kind', dir: 'desc' } },
  { value: 'book-asc', label: 'Book order', key: { column: 'book', dir: 'asc' } },
  { value: 'book-desc', label: 'Book order, reversed', key: { column: 'book', dir: 'desc' } },
  { value: 'mentions-desc', label: 'Most mentioned', key: { column: 'mentions', dir: 'desc' } },
  { value: 'mentions-asc', label: 'Least mentioned', key: { column: 'mentions', dir: 'asc' } },
];
const DEFAULT_ENTRY_ORDER = 'name-asc';
const entryOrderOf = (sort: readonly { column: ColumnKey; dir: 'asc' | 'desc' }[]): string => {
  const first = sort[0] ?? DEFAULT_SORT[0]!;
  return `${first.column}-${first.dir}`;
};

/**
 * Story Bible order: the one column the entry table sorts by first, the same sort its headers and Sort menu keep in this browser window. A
 * choice here replaces the header clicks that broke ties. It reads the stored sort on every change (a header click while this is shown, or
 * another window's write), so it never shows an order the Story Bible is not using.
 */
export function EntrySortBody() {
  const { notify } = useSettingsHost();
  useBrowserSettingsVersion();
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === ENTRY_SORT_STORAGE_KEY) announceBrowserSettingChange();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const stored = loadEntrySort();
  const order = entryOrderOf(stored);
  const changed = JSON.stringify(stored) !== JSON.stringify(DEFAULT_SORT);
  const choose = (value: string) => {
    const picked = ENTRY_ORDERS.find((option) => option.value === value);
    if (picked && !saveEntrySort([picked.key])) notify('Story Bible order was not saved: this browser is not keeping settings.', 'error');
  };
  return (
    <div className="flex items-center gap-2">
      <Select
        label="Story Bible order"
        value={order}
        onChange={choose}
        options={ENTRY_ORDERS.map(({ value, label }) => ({ value, label }))}
        className={READER_FIELD}
      />
      {changed && (
        <IconButton action="undo" label="Reset Story Bible order to Name, A to Z" className="border-transparent" onClick={() => choose(DEFAULT_ENTRY_ORDER)} />
      )}
    </div>
  );
}

/** First-use tips: how many were dismissed with Got it, and Show tips again, which forgets them all (the host keeps them in Tips.seen). */
export function TipsBody() {
  const { notify } = useSettingsHost();
  const { seen, failed, reset, retry } = useTips();
  const [busy, setBusy] = useState(false);
  const count = seen?.size ?? 0;
  const showAgain = async () => {
    setBusy(true);
    const problem = await reset();
    setBusy(false);
    if (problem) notify(`The tips could not be shown again: ${problem}`, 'error');
  };
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm">{seen === null ? (failed ? 'Could not be read' : 'Reading…') : count === 0 ? 'None dismissed' : `${count} dismissed`}</span>
      {seen === null && failed ? (
        <IconButton action="retry" size="sm" onClick={retry} />
      ) : (
        <Button variant="secondary" size="sm" disabled={busy || count === 0} onClick={() => void showAgain()}>
          Show tips again
        </Button>
      )}
    </div>
  );
}
