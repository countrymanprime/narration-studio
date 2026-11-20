import { Radio as BaseRadio } from '@base-ui/react/radio';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement } from 'react';
import { absorbEchoAt } from './echoGuard';
import { isStoredHex, normaliseHex, toPickerValue } from './colourHex';
import { Icon } from './Icon';
import { Popover } from './Popover';
import { COLOUR_BOX_CLASSES } from './selectBox';
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
  /**
   * For a form that saves later: called with the text of a box left holding what is not a colour, so the form holds it as its unsaved value
   * (it then asks before the narrator leaves, and the host refuses it on Save). Without it the text stays in the box, marked, and goes nowhere.
   */
  onRefused?: (text: string) => void;
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

  // A press while a save runs moves no focus (`SwatchRadio`), so focus is on the swatch being saved. When the answer is in, or the value
  // changes under a focused swatch, focus follows the check: a refused save would otherwise leave focus on a swatch that is not the chosen one.
  const group = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pending) return;
    const focused = document.activeElement;
    if (!group.current || !focused || !group.current.contains(focused) || focused.getAttribute('aria-checked') !== 'false') return;
    group.current.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
  }, [pending, checkedKey]);

  const row = (popover?: PopoverHandlers) => (
    <BaseRadioGroup
      ref={group}
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
        <SwatchRadio key={entry.key} entry={entry} pending={pending} popover={popover} />
      ))}
    </BaseRadioGroup>
  );
  if (form === 'row') return row();

  const chosen = entries.find((entry) => entry.key === checkedKey);
  const shownName = chosen?.name ?? 'None';
  const popover: PopoverHandlers = {
    // A press or Space has already checked the swatch through the group; Enter checks nothing in a radio group, so it is reported here.
    pick: (key, how, spot) => {
      if (pending) return;
      if (how === 'enter' && key !== checkedKey) report(key);
      // The swatches are gone before the second press of a double click, which would land on the row under them.
      if (spot) absorbEchoAt(spot);
      setOpen(false);
    },
    close: () => setOpen(false),
  };
  const trigger = (
    <button
      type="button"
      // The name starts with what the control is for and holds the text it shows, so the visible words are part of the name.
      aria-label={`${label}: ${shownName}`}
      aria-busy={pending || undefined}
      disabled={disabled}
      // The name is whole or not drawn: it wraps under the swatch when the box has no room for it, where the box's height hides it, so a
      // narrow box is a swatch and a caret and never half a word. The hint and the accessible name still say it.
      className={`${COLOUR_BOX_CLASSES} flex w-full flex-wrap content-start gap-x-1.5 overflow-hidden text-left`}
    >
      {chosen && (
        <span className="flex h-full items-center">
          <Swatch colour={chosen.token} />
        </span>
      )}
      <span className={`flex h-full flex-none items-center whitespace-nowrap ${chosen ? '' : 'text-[var(--text-muted)]'}`}>{shownName}</span>
    </button>
  );
  return (
    // The hint is the box's own, so it rests while the swatches are open (theirs show then).
    // It may be narrower than the name (`min-w-0`): a row with no room shrinks the box, which then draws the swatch alone.
    <TooltipTarget text={open ? '' : shownName} className={`min-w-0 ${className}`}>
      {/* The box sits in a list that scrolls (a dialog's body, a Settings page), so the swatches stay inside the window when the box scrolls away or the window shrinks. */}
      <Popover trigger={trigger} label={label} align="start" sideOffset={4} compact fitToWindow open={open} onOpenChange={setOpen}>
        {row(popover)}
      </Popover>
    </TooltipTarget>
  );
}

/** What a swatch does when its row is the content of a popover. `spot` is the swatch's box, given for a pointer press. */
type PopoverHandlers = { pick: (key: string, how: 'press' | 'enter', spot?: DOMRect) => void; close: () => void };

// 28 px square (over the 24 px press target) around an 18 px swatch. The chosen one is told by shape, a 2 px ring in the text colour and a
// check on the swatch, never by colour alone; the ring is a border, so the keyboard focus outline (the global one) is drawn outside it.
const RADIO_CLASSES =
  'box-border inline-flex h-7 min-w-7 cursor-pointer items-center justify-center gap-1 rounded-[var(--control-radius)] border-2 border-transparent data-[checked]:border-[var(--text)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-55 not-data-[disabled]:not-data-[checked]:hover:bg-[var(--surface-2)]';

function SwatchRadio({ entry, pending, popover }: { entry: Entry; pending: boolean; popover?: PopoverHandlers }) {
  return (
    <TooltipTarget text={entry.name}>
      <BaseRadio.Root
        value={entry.key}
        aria-label={entry.name}
        // A press while a save runs picks nothing, so it takes no focus either: focus stays on the swatch being saved.
        onMouseDown={(event: MouseEvent) => {
          if (pending) event.preventDefault();
        }}
        // `detail` is 0 for the click a Space press makes, which no second press follows.
        onClick={(event: MouseEvent<HTMLElement>) =>
          popover?.pick(entry.key, 'press', event.detail > 0 ? event.currentTarget.getBoundingClientRect() : undefined)
        }
        onKeyDown={(event: KeyboardEvent) => {
          // While a save runs the group checks nothing, but it would still move focus on an arrow key, leaving focus on one swatch and the
          // check on another. The key stops here, so focus stays on the swatch being saved and the next key after the answer starts from it.
          if (pending && event.key.startsWith('Arrow')) event.stopPropagation();
          if (event.key === 'Enter') popover?.pick(entry.key, 'enter');
          // One Escape closes the swatches. Left to the libraries, the first would only dismiss the focused swatch's hint; stopped here, it
          // does not reach the dialog the box may sit in either.
          if (event.key === 'Escape' && popover) {
            event.stopPropagation();
            popover.close();
          }
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

/** The picker's and the hex box's names. Each holds the label as it is drawn beside the control, so a narrator who speaks what they see reaches it. */
export function freeNames(label: string): { picker: string; hex: string } {
  return { picker: label, hex: `${label} hex` };
}

function Free({
  label,
  value,
  onChange,
  allowUnset = false,
  onRefused,
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
  // The draft that was refused. It stands while that text is in the box, so typing, Escape or a new value ends it.
  const [refusedDraft, setRefusedDraft] = useState<string | null>(null);
  const box = useSettledDraft(value, (draft) => {
    const hex = normaliseHex(draft);
    if (!isStoredHex(hex) && !(hex === '' && allowUnset)) {
      setRefusedDraft(draft);
      onRefused?.(hex);
      return;
    }
    if (hex !== value) onChange(hex);
    // The box shows the stored colour from here on: the new one once the caller holds it, the old one if the save is refused. A draft kept
    // until the answer would read as stored after a refusal.
    box.reset();
  });
  const refused = refusedDraft !== null && box.draft === refusedDraft && box.draft !== value;
  // A value that is not a colour (a form holding refused text, a file edited by hand) is marked the same way.
  const notAColour = refused || (value !== '' && !isStoredHex(normaliseHex(value)));

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

  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <TextField ref={picker} type="color" label={names.picker} value={dragged ?? toPickerValue(value)} disabled={disabled} onChange={setDragged} />
      {/* The reason a box is marked, for a narrator who sees it: a hint on the box, which takes no room in the row. It is empty, so off, otherwise. */}
      <TooltipTarget text={notAColour ? HEX_HINT : ''} className={hexClassName || 'min-w-0 flex-1'}>
        <TextField
          id={id}
          label={names.hex}
          mono
          value={box.draft}
          disabled={disabled}
          placeholder={placeholder}
          className="min-w-0"
          aria-describedby={[notAColour ? hintId : '', describedBy ?? ''].filter(Boolean).join(' ') || undefined}
          aria-invalid={notAColour || invalid ? true : undefined}
          onChange={(text) => {
            setRefusedDraft(null);
            box.setDraft(text);
          }}
          {...box.boxProps}
        />
      </TooltipTarget>
      {notAColour && (
        <span id={hintId} className="sr-only">
          {HEX_HINT}
        </span>
      )}
    </span>
  );
}
