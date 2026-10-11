/**
 * The hues a swatch can be filled from, each a custom property declared in `styles.css` (the Swatch test reads the file
 * and fails a name it does not declare): the entity-kind hues, the seven speaker hues that alias them (ADR 0367) and the
 * status hues.
 */
export const SWATCH_COLOURS = [
  'accent',
  'character',
  'place',
  'org',
  'review',
  'lore',
  'item',
  'event',
  'note',
  'speaker-1',
  'speaker-2',
  'speaker-3',
  'speaker-4',
  'speaker-5',
  'speaker-6',
  'speaker-7',
  'ok',
  'warn',
  'danger',
  'info',
  'non-text',
] as const;

export type SwatchColour = (typeof SWATCH_COLOURS)[number];

/**
 * A small rounded square filled from a token (the mock's `Swatch`): 12 px with a 3 px radius, or `size` px square. The
 * colour is a token name, never a raw value, so a page cannot paste a hex. It is decorative: the label beside it names the
 * thing, so it is `aria-hidden`. It sits on the text's middle and does not shrink in a flex row.
 */
export function Swatch({ colour, size }: { colour: SwatchColour; size?: number }) {
  if (!(SWATCH_COLOURS as readonly string[]).includes(colour)) throw new Error(`Swatch: "${colour}" is not a known token name`);
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 grow-0 self-center rounded-[3px] align-middle"
      style={{ background: `var(--${colour})`, width: size ?? 12, height: size ?? 12, borderRadius: size ? undefined : 3 }}
    />
  );
}
