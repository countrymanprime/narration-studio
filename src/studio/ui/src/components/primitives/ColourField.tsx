import { Radio as BaseRadio } from '@base-ui/react/radio';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { isStoredHex, normaliseHex, toPickerValue } from './colourHex';
import { Icon } from './Icon';
import { Popover } from './Popover';
import { SELECT_BOX_CLASSES } from './selectBox';
import { useSettledDraft } from './settledDraft';
import { Swatch, type SwatchColour } from './Swatch';
import { TextField } from './TextField';
import { TooltipTarget } from './Tooltip';

/** One colour of a palette: the value the caller stores, the token it is drawn from and the name a narrator reads for it. */
export type ColourChoice<V extends string> = { value: V; token: SwatchColour; name: string };

type Common = { label: string; disabled?: boolean; className?: string };

type PaletteProps<V extends string> = Common & {
  mode: 'palette';
  /** The caller's token set, in the order it is drawn. */
  choices: readonly ColourChoice<V>[];
  /** `null` when Automatic is chosen. */
  value: V | null;
  /** Adds a first choice, "Automatic (<name>)", drawn in the colour the caller would pick by itself. */
  automatic?: { resolvesTo: V };
  onChange: (value: V | null) => void;
  /** `row` draws the swatches in place; `popover` draws one select-like box that opens them, for a table cell or a narrow column. */
  form?: 'row' | 'popover';
  /** A save is running: the control keeps focus and its look, and a pick does nothing until it ends. */
  pending?: boolean;
};

type FreeProps = Common & {
  mode: 'free';
  /** Six capital hex digits with no `#`, or '' for no colour. */
  value: string;
  /** Called with six capital hex digits, or with '' when `allowUnset` and the box was emptied. Never with anything else. */
  onChange: (hex: string) => void;
  allowUnset?: boolean;
  placeholder?: string;
  /** The hex box's id, for a visible `<label htmlFor>`. */
  id?: string;
  describedBy?: string;
  /** The caller's own verdict on the stored value (a host error), added to the box's own. */
  invalid?: boolean;
  /** Sets the hex box's width. */
  hexClassName?: string;
};

/**
 * The app's one colour selector (docs/design/design-system.md#primitive-components). `palette` chooses one of the caller's token colours, as a
 * row of swatches that is a radio group, or as a box that opens that row; `free` chooses any colour, with the browser's picker and a hex box.
 * A palette colour is a token and never a raw value; the names are the caller's, since one token has different names on different pages.
 */
export function ColourField<V extends string>(props: PaletteProps<V> | FreeProps): ReactElement {
  return props.mode === 'palette' ? <Palette {...props} /> : <Free {...props} />;
}

// What the radio group holds for Automatic, which the caller sees as `null`. No stored value is this string.
const AUTOMATIC = '\u0000automatic';

type Entry = { key: string; token: SwatchColour; name: string; caption?: string };

function entriesOf<V extends string>(choices: readonly ColourChoice<V>[], automatic: { resolvesTo: V } | undefined): Entry[] {
  const own = choices.map((choice) => ({ key: choice.value as string, token: choice.token, name: choice.name }));
  if (!automatic) return own;
  const resolved = choices.find((choice) => choice.value === automatic.resolvesTo);
  if (!resolved) throw new Error(`ColourField: Automatic resolves to "${automatic.resolvesTo}", which is not one of the choices`);
  return [{ key: AUTOMATIC, token: resolved.token, name: `Automatic (${resolved.name})`, caption: 'Auto' }, ...own];
}

function Palette<V extends string>({
  label,
  choices,
  value,
  automatic,
  onChange,
  form = 'row',
  pending = false,
  disabled = false,
  className = '',
}: PaletteProps<V>) {
  const [open, setOpen] = useState(false);
  const entries = entriesOf(choices, automatic);
  const checkedKey = value ?? (automatic ? AUTOMATIC : null);
  const report = (key: string) => onChange(key === AUTOMATIC ? null : (key as V));

  const row = (onPress?: (key: string, how: 'press' | 'enter') => void) => (
    <BaseRadioGroup
      aria-label={label}
      aria-busy={pending || undefined}
      value={checkedKey}
      // Base UI types the value as unknown; every radio below is given a string key.
      onValueChange={(next) => report(next as string)}
      readOnly={pending}
      disabled={disabled}
      className={`flex flex-wrap items-center gap-1 ${form === 'row' ? className : ''}`}
    >
      {entries.map((entry) => (
        <SwatchRadio key={entry.key} entry={entry} onPress={onPress} />
      ))}
    </BaseRadioGroup>
  );
  if (form === 'row') return row();

  const chosen = entries.find((entry) => entry.key === checkedKey);
  const shownName = chosen?.name ?? 'None';
  // A press or Space has already checked the swatch through the group; Enter checks nothing in a radio group, so it is reported here.
  const pickAndClose = (key: string, how: 'press' | 'enter') => {
    if (pending) return;
    if (how === 'enter' && key !== checkedKey) report(key);
    setOpen(false);
  };
  const trigger = (
    <button
      type="button"
      // The name starts with what the control is for and holds the text it shows, so the visible words are part of the name.
      aria-label={`${label}: ${shownName}`}
      aria-busy={pending || undefined}
      title={shownName}
      disabled={disabled}
      className={`${SELECT_BOX_CLASSES} flex items-center gap-2 overflow-hidden text-left ${className}`}
    >
      {chosen && <Swatch colour={chosen.token} />}
      <span className={`min-w-0 flex-1 truncate ${chosen ? '' : 'text-[var(--text-muted)]'}`}>{shownName}</span>
    </button>
  );
  return (
    <Popover trigger={trigger} label={label} align="start" sideOffset={4} compact open={open} onOpenChange={setOpen}>
      {row(pickAndClose)}
    </Popover>
  );
}

// 28 px square (over the 24 px press target) around an 18 px swatch. The chosen one is told by shape, a 2 px ring in the text colour and a
// check on the swatch, never by colour alone; the ring is a border, so the keyboard focus outline (the global one) is drawn outside it.
const RADIO_CLASSES =
  'box-border inline-flex h-7 min-w-7 cursor-pointer items-center justify-center gap-1 rounded-[var(--control-radius)] border-2 border-transparent data-[checked]:border-[var(--text)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55 not-data-[disabled]:not-data-[checked]:hover:bg-[var(--surface-2)]';

function SwatchRadio({ entry, onPress }: { entry: Entry; onPress?: (key: string, how: 'press' | 'enter') => void }) {
  return (
    <TooltipTarget text={entry.name}>
      <BaseRadio.Root
        value={entry.key}
        aria-label={entry.name}
        onClick={() => onPress?.(entry.key, 'press')}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === 'Enter') onPress?.(entry.key, 'enter');
        }}
        className={`${RADIO_CLASSES} ${entry.caption ? 'px-1' : ''}`}
      >
        <span className="relative inline-flex">
          <Swatch colour={entry.token} size={18} />
          {/* --surface on every palette hue is at least 3:1 in both themes (paletteContrast.test.ts, `colour-field-check-*`). */}
          <BaseRadio.Indicator className="absolute inset-0 flex items-center justify-center text-[0.625rem] text-[var(--surface)] data-[unchecked]:hidden">
            <Icon name="accept" />
          </BaseRadio.Indicator>
        </span>
        {entry.caption && <span className="text-xs">{entry.caption}</span>}
      </BaseRadio.Root>
    </TooltipTarget>
  );
}

const HEX_HINT = 'Six hex digits, like B5473C';

/** The picker's and the hex box's names. A label that already ends in "color" or "colour" does not say it twice. */
export function freeNames(label: string): { picker: string; hex: string } {
  const base = label.replace(/\s*colou?r$/i, '').trim();
  return base ? { picker: `${base} colour`, hex: `${base} hex` } : { picker: 'Colour', hex: 'Hex' };
}

function Free({
  label,
  value,
  onChange,
  allowUnset = false,
  placeholder,
  id,
  describedBy,
  invalid = false,
  disabled = false,
  className = '',
  hexClassName = '',
}: FreeProps) {
  const hintId = useId();
  const names = freeNames(label);
  const [refused, setRefused] = useState(false);
  const box = useSettledDraft(value, (draft) => {
    const hex = normaliseHex(draft);
    const accepted = isStoredHex(hex) || (hex === '' && allowUnset);
    setRefused(!accepted);
    if (!accepted) return;
    if (hex === value) box.reset();
    else onChange(hex);
  });

  // The picker reports once, when the narrator closes it: React's `onChange` on a colour input is the DOM `input` event, which fires on every
  // step of a drag, and each would be a save. The DOM `change` event is the one that fires on close, so it is heard directly.
  const picker = useRef<HTMLInputElement>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  useEffect(() => {
    const input = picker.current;
    if (!input) return;
    const settle = () => {
      const hex = normaliseHex(input.value);
      setDragged(null);
      if (isStoredHex(hex) && hex !== latest.current.value) latest.current.onChange(hex);
    };
    input.addEventListener('change', settle);
    return () => input.removeEventListener('change', settle);
  }, []);

  const isInvalid = refused || invalid;
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <TextField ref={picker} type="color" label={names.picker} value={dragged ?? toPickerValue(value)} disabled={disabled} onChange={setDragged} />
      <TextField
        id={id}
        label={names.hex}
        mono
        value={box.draft}
        disabled={disabled}
        placeholder={placeholder}
        className={hexClassName}
        aria-describedby={[refused ? hintId : '', describedBy ?? ''].filter(Boolean).join(' ') || undefined}
        aria-invalid={isInvalid ? true : undefined}
        onChange={(text) => {
          setRefused(false);
          box.setDraft(text);
        }}
        onBlur={box.boxProps.onBlur}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setRefused(false);
          box.boxProps.onKeyDown(event);
        }}
      />
      <span id={hintId} className="sr-only">
        {HEX_HINT}
      </span>
    </span>
  );
}
