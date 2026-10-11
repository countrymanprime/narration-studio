import { IconButton } from '../../../../primitives/IconButton';
import { Popover } from '../../../../primitives/Popover';
import { Select } from '../../../../primitives/Select';
import { Slider } from '../../../../primitives/Slider';
import { READER_FONTS, READER_SIZES, READER_SPACING, READER_WIDTHS, widthName, type TextPrefs } from './readerText';

const FONT_OPTIONS = READER_FONTS.map(([name]) => ({ value: name, label: name }));

/** What the trigger's hint says: the four current choices. */
export const textSettingsSummary = (prefs: TextPrefs): string =>
  `Text settings: ${prefs.font}, ${prefs.size} px, line spacing ${prefs.spacing.toFixed(1)}, ${widthName(prefs.width).toLowerCase()} column`;

// The four reading settings in one place (the mock's `TextSettings`): font, size, line spacing and column width, each with its
// current value. Controlled; `useTextPrefs` keeps and saves the choices.
export function TextSettings({ prefs, onChange }: { prefs: TextPrefs; onChange: (change: Partial<TextPrefs>) => void }) {
  const sizeIndex = Math.max(0, READER_SIZES.indexOf(prefs.size));
  const widthIndex = Math.max(
    0,
    READER_WIDTHS.findIndex(([, percent]) => percent === prefs.width),
  );
  return (
    <div className="flex min-w-[300px] flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-[var(--text-muted)]">Font</span>
        <Select label="Font" value={prefs.font} onChange={(font) => onChange({ font })} options={FONT_OPTIONS} fullWidth />
      </div>
      <Slider
        label="Size"
        valueText={`${prefs.size} px`}
        min={0}
        max={READER_SIZES.length - 1}
        step={1}
        value={sizeIndex}
        onValueChange={(index) => onChange({ size: READER_SIZES[index] })}
      />
      <Slider
        label="Line spacing"
        valueText={prefs.spacing.toFixed(1)}
        min={READER_SPACING.min}
        max={READER_SPACING.max}
        step={READER_SPACING.step}
        value={prefs.spacing}
        onValueChange={(spacing) => onChange({ spacing: +spacing.toFixed(1) })}
      />
      <Slider
        label="Column width"
        valueText={widthName(prefs.width)}
        min={0}
        max={READER_WIDTHS.length - 1}
        step={1}
        value={widthIndex}
        onValueChange={(index) => onChange({ width: READER_WIDTHS[index]?.[1] })}
      />
    </div>
  );
}

/** The Script menu's entry point: an icon button whose hint states the choices, opening the settings in a popover. */
export function TextSettingsPopover({ prefs, onChange }: { prefs: TextPrefs; onChange: (change: Partial<TextPrefs>) => void }) {
  return (
    <Popover trigger={<IconButton action="textSettings" label={textSettingsSummary(prefs)} />} label="Text settings">
      <TextSettings prefs={prefs} onChange={onChange} />
    </Popover>
  );
}
