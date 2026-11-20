// The closed box of a picker, drawn by us, not the operating system: its own caret (two gradients in --text-muted, so it follows the theme) in 2 rem
// kept clear at the right, so it looks like the app's other pickers beside it (the Booth's chapter picker, alignment audit XBO-20) and a long
// label stops before the caret (R3MS-19). `Select` (a native `<select>`) and `TreeSelect` (a button over a tree) share it so the two read as one control.
const FRAME =
  'box-border h-[var(--control-height)] appearance-none rounded-[var(--control-radius)] border border-[var(--line-strong)] bg-[var(--surface)] bg-no-repeat py-0 text-[0.88rem] leading-[1.35] text-[var(--text)] disabled:cursor-not-allowed disabled:bg-[var(--surface-2)] disabled:text-[var(--text-muted)] [background-image:linear-gradient(45deg,transparent_50%,var(--text-muted)_50%),linear-gradient(135deg,var(--text-muted)_50%,transparent_50%)] [background-position:calc(100%-1rem)_50%,calc(100%-0.6875rem)_50%] [background-size:0.3125rem_0.3125rem,0.3125rem_0.3125rem]';

export const SELECT_BOX_CLASSES = `${FRAME} pr-8 pl-3`;

// The same box around a swatch and a colour's name (`ColourField`'s popover form), which sits in columns as narrow as 97 px: 1.5 rem kept clear
// for the caret and 0.5 rem at the left, so a name as long as "Amber" or "Copper" is whole at a 390 px window (colour-field.spec.ts).
export const COLOUR_BOX_CLASSES = `${FRAME} pr-6 pl-2`;
