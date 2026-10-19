// The one map from what a highlighted thing IS to how it is drawn (docs/research/finding-colours-and-chips.md section 4, with
// the owner's answers D1..D13 of section 5.4). A kind has one colour family, one text-mark shape and one chip shape on every page:
// the document, a chip, a legend entry and a list marker all read this entry. Pages call `kindDef`, `kindMarkStyle` or
// `KindMark`/`KindChip`; none keeps a map of its own (kindMap.test.ts).
//
// Colour follows the family: red = the words are wrong (D1, and long silence, D4 as the owner overrode it); amber = the audio or the
// recogniser is in doubt; blue = pronunciation. Kinds of one family are told apart by shape and label, never by colour alone.
import { toneColors, type BadgeColors, type BadgeShape, type StatusTone } from '../components/primitives/StatusBadge';
import { tint, tintOver, type EntityColour, FAINT_COLOUR } from './entityColour';

type KindFamily = 'mistake' | 'audio' | 'pronunciation' | 'search' | 'entity' | 'speaker';

/** The shape of a text mark. Each shape is used by one kind app-wide, so a reader tells two red kinds apart without colour. */
type MarkShape = 'wavy' | 'dashed-box' | 'bar' | 'double' | 'thin' | 'dotted' | 'tint';

type MarkRecipe = {
  shape: MarkShape;
  /** Whether the mark paints a fill behind the words. */
  fill: boolean;
  italic?: boolean;
  /** The words are drawn muted (they were not said). */
  muted?: boolean;
};

/** Where a kind's colour comes from: a fixed hue, or the entry's own (`entityColour.ts`). */
type KindHue = 'danger' | 'warn' | 'info' | 'search' | 'neutral' | 'entity';

export type KindId =
  | 'misread'
  | 'missing'
  | 'extra'
  | 'repeat'
  | 'pacing'
  | 'breath'
  | 'click'
  | 'noise'
  | 'plosive'
  | 'low'
  | 'pron'
  | 'search'
  | 'entity'
  | 'speaker'
  | 'speaker-suggested'
  | 'speaker-unknown';

export type KindDef = {
  id: KindId;
  label: string;
  family: KindFamily;
  hue: KindHue;
  /** The text mark, or null for a kind that is not drawn in running text (a pin on the waveform and a chip only). */
  mark: MarkRecipe | null;
  /** The chip's default shape: a `tag` for a kind of finding, a `pill` for an entry or a speaker. */
  chip: BadgeShape;
  /** The chip's border: unknown and suggested speakers are dashed. */
  dashed?: boolean;
};

const KINDS: Record<KindId, Omit<KindDef, 'id'>> = {
  // The mistake family (D1): the words are wrong.
  misread: { label: 'Misread', family: 'mistake', hue: 'danger', mark: { shape: 'wavy', fill: true }, chip: 'tag' },
  missing: { label: 'Missing', family: 'mistake', hue: 'danger', mark: { shape: 'dashed-box', fill: false, muted: true }, chip: 'tag' },
  extra: { label: 'Extra words', family: 'mistake', hue: 'danger', mark: { shape: 'bar', fill: true, italic: true }, chip: 'tag' },
  repeat: { label: 'Repeat', family: 'mistake', hue: 'danger', mark: { shape: 'double', fill: false }, chip: 'tag' },
  // D4, the owner's override: a long silence is a pacing mistake, red, not the recommended amber.
  pacing: { label: 'Long silence', family: 'mistake', hue: 'danger', mark: null, chip: 'tag' },
  // The audio family: the recording or the recogniser is in doubt.
  breath: { label: 'Breath', family: 'audio', hue: 'warn', mark: null, chip: 'tag' },
  click: { label: 'Click', family: 'audio', hue: 'warn', mark: null, chip: 'tag' },
  noise: { label: 'Noise', family: 'audio', hue: 'warn', mark: null, chip: 'tag' },
  plosive: { label: 'Plosive', family: 'audio', hue: 'warn', mark: null, chip: 'tag' },
  low: { label: 'Low confidence', family: 'audio', hue: 'warn', mark: { shape: 'thin', fill: false }, chip: 'tag' },
  pron: { label: 'Pronunciation', family: 'pronunciation', hue: 'info', mark: { shape: 'dotted', fill: false }, chip: 'tag' },
  // D9: a find hit keeps its own hue so it never reads as a Location or a Query.
  search: { label: 'Find hit', family: 'search', hue: 'search', mark: { shape: 'tint', fill: true }, chip: 'tag' },
  // An entry of a Story Bible type; the hue is the entry's (entityColour.ts).
  entity: { label: 'Entry', family: 'entity', hue: 'entity', mark: { shape: 'tint', fill: true }, chip: 'pill' },
  // D6: a speaker is drawn in its entry's colour; a suggested one is dashed; an unknown one is neutral and dashed.
  speaker: { label: 'Speaker', family: 'speaker', hue: 'entity', mark: null, chip: 'pill' },
  'speaker-suggested': { label: 'Suggested speaker', family: 'speaker', hue: 'entity', mark: null, chip: 'pill', dashed: true },
  'speaker-unknown': { label: 'Unknown speaker', family: 'speaker', hue: 'neutral', mark: null, chip: 'pill', dashed: true },
};

export const KIND_IDS = Object.keys(KINDS) as KindId[];

export const kindDef = (id: KindId): KindDef => ({ id, ...KINDS[id] });

/** The kinds that are drawn in running text. */
export const MARKED_KIND_IDS = KIND_IDS.filter((id) => KINDS[id].mark !== null);

/** The pure colour, the text colour and the soft fill of a fixed hue, as the custom properties of styles.css. */
const FIXED: Record<Exclude<KindHue, 'entity'>, { line: string; text: string; soft: string | null; tone: StatusTone | null }> = {
  danger: { line: '--danger', text: '--danger-text', soft: '--danger-soft', tone: 'danger' },
  warn: { line: '--warn', text: '--warn-text', soft: '--warn-soft', tone: 'warning' },
  info: { line: '--info', text: '--info-text', soft: '--info-soft', tone: 'info' },
  // `--search` has no soft token (D13): its tint is the helper's.
  search: { line: '--search', text: '--search-text', soft: null, tone: null },
  // The dashed border of an unknown speaker is the signal besides the label, so it takes the 3:1 border (`--line-strong`), not the hairline.
  neutral: { line: '--line-strong', text: '--text-muted', soft: '--surface-2', tone: 'neutral' },
};

/** The colours a kind draws with: the fixed hue's, or `colour` (an entry's) for an entity or speaker kind, the neutral fallback when none is given. */
export function kindColour(id: KindId, colour?: EntityColour): { line: string; text: string; soft: string | null } {
  const hue = KINDS[id].hue;
  if (hue === 'entity') {
    const entity = colour ?? FAINT_COLOUR;
    return { line: entity.line, text: entity.text, soft: null };
  }
  return FIXED[hue];
}

/** The fill behind a marked word: the soft token where there is one, else a 20% tint (the reader's rows are banded, so the tint is transparent). */
export function kindFill(id: KindId, colour?: EntityColour): string {
  const { line, soft } = kindColour(id, colour);
  return soft ? `var(${soft})` : tint(line, 20);
}

/** The colours of a chip: a status tone's for a fixed hue, else the entry's tint with its text colour (the entity badge recipe, 18% over the surface). */
export function kindChipColors(id: KindId, colour?: EntityColour): BadgeColors {
  const hue = KINDS[id].hue;
  if (hue === 'neutral') return { ...toneColors('neutral'), line: `var(${FIXED.neutral.line})` };
  if (hue !== 'entity' && FIXED[hue].tone) return toneColors(FIXED[hue].tone);
  const { line, text } = kindColour(id, colour);
  return { fill: tintOver(line, 18), text: `var(${text})`, line: `var(${line})` };
}
