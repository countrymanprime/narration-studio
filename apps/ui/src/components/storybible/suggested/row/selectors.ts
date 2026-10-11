// The pure selectors behind the suggestion row, the confidence chip and the accepted claims (SN-X41), ported from the Studio Next
// mock's src/selectors/extraction.ts. They read the suggestions the host lists (api/contracts/extraction.ts) and change nothing.

import type { ClaimKind, ExtractionSuggestion, SuggestionPayload } from '../../../../api/contracts/extraction';

/** The 75% rule's line (the Studio Next extraction PRD): a suggestion at or above it is accepted for the narrator, under it or with no score they check it. The host applies the rule and sets the status; this is only the number the chip's explanation quotes. */
export const VERIFY_BELOW = 0.75;

/** A confidence as a whole percent. */
export const pct = (confidence: number): number => Math.round(confidence * 100);

/** The kinds that say something about an entry in the text: with no quote there is nothing to show for the claim. */
const NEEDS_QUOTE: ReadonlySet<ExtractionSuggestion['kind']> = new Set(['property', 'claim', 'speaker']);

export const CLAIM_LABEL = { talk: 'Says', act: 'Does', know: 'Knows' } as const satisfies Record<ClaimKind, string>;

/** What kind of thing a suggestion is, for a label. */
export function kindLabel(payload: SuggestionPayload): string {
  switch (payload.kind) {
    case 'claim':
      return CLAIM_LABEL[payload.claim];
    case 'entry':
      return 'New entry';
    case 'alias':
      return 'Name';
    case 'property':
      return 'Detail';
    case 'relationship':
      return 'Relationship';
    case 'speaker':
      return 'Speaker';
  }
}

/** The suggestion in a line. */
export function summaryOf(payload: SuggestionPayload): string {
  switch (payload.kind) {
    case 'entry':
      return payload.name + (payload.type ? ` (${payload.type})` : '') + (payload.description ? `: ${payload.description}` : '');
    case 'alias':
      return payload.alias;
    case 'property':
      return `${payload.key}: ${payload.value}`;
    case 'relationship':
      return `${payload.entry} ${payload.relation} ${payload.to}`;
    case 'claim':
      return payload.text;
    case 'speaker':
      return `${payload.quote} spoken by ${payload.speaker}`;
  }
}

/** The one text of a suggestion the narrator can change while accepting it. */
export function editableText(payload: SuggestionPayload): string {
  switch (payload.kind) {
    case 'entry':
      return payload.name;
    case 'alias':
      return payload.alias;
    case 'property':
      return payload.value;
    case 'relationship':
      return payload.relation;
    case 'claim':
      return payload.text;
    case 'speaker':
      return payload.speaker;
  }
}

/** The payload with its editable text replaced by `text`, trimmed. */
export function withText(payload: SuggestionPayload, text: string): SuggestionPayload {
  const value = text.trim();
  switch (payload.kind) {
    case 'entry':
      return { ...payload, name: value };
    case 'alias':
      return { ...payload, alias: value };
    case 'property':
      return { ...payload, value };
    case 'relationship':
      return { ...payload, relation: value };
    case 'claim':
      return { ...payload, text: value };
    case 'speaker':
      return { ...payload, speaker: value };
  }
}

/** What the page knows about the entry a suggestion belongs to, for the chip's explanation; the row does not know the Story Bible. */
export type ConfidenceContext = { entryName?: string; chapters?: number };

/** The words behind a confidence chip: the percent against the line, whether the quote was found, and how many chapters mention the entry. */
export function confidenceWhy(suggestion: ExtractionSuggestion, context: ConfidenceContext = {}): string {
  const { confidence } = suggestion;
  const parts: string[] = [];
  if (confidence === null) parts.push('No confidence was given, so you check it.');
  else {
    const accepted = confidence >= VERIFY_BELOW;
    parts.push(
      `${pct(confidence)}% ${accepted ? 'is at or above' : 'is under'} ${pct(VERIFY_BELOW)}%${accepted ? ', so it was accepted for you.' : ', so you check it.'}`,
    );
  }
  if (suggestion.evidence.length) parts.push('The quote was found in the text.');
  else if (suggestion.unverifiedQuote) parts.push('The quote was not found in the text.');
  else if (NEEDS_QUOTE.has(suggestion.kind)) parts.push('It has no quote.');
  if (context.entryName !== undefined && context.chapters !== undefined) {
    parts.push(`“${context.entryName}” is mentioned in ${context.chapters} ${context.chapters === 1 ? 'chapter' : 'chapters'}.`);
  }
  return parts.join(' ');
}

const needsVerifying = (s: ExtractionSuggestion): boolean => s.status === 'needs-verification';
const accepted = (s: ExtractionSuggestion): boolean => s.status === 'accepted' || s.status === 'accepted-auto';

/** How many suggestions the narrator still has to verify. */
export const verifyCount = (list: readonly ExtractionSuggestion[]): number => list.filter(needsVerifying).length;

/** How many of one entry's suggestions the narrator still has to verify. */
export const verifyOf = (list: readonly ExtractionSuggestion[], entryId: string): number =>
  list.filter((s) => needsVerifying(s) && s.entryId === entryId).length;

/** Suggestions to verify that have no entry in the Story Bible yet (a new entry offered, or something about an entry that is not there). */
export const unattached = (list: readonly ExtractionSuggestion[]): ExtractionSuggestion[] => list.filter((s) => !s.entryId && needsVerifying(s));

/** The entry's accepted claims (the narrator's or automatic) of one kind. */
export const claimsOf = (list: readonly ExtractionSuggestion[], entryId: string, claim: ClaimKind): ExtractionSuggestion[] =>
  list.filter((s) => s.entryId === entryId && s.payload.kind === 'claim' && s.payload.claim === claim && accepted(s));

/** The entry's accepted details. */
export const propertiesOf = (list: readonly ExtractionSuggestion[], entryId: string): ExtractionSuggestion[] =>
  list.filter((s) => s.entryId === entryId && s.payload.kind === 'property' && accepted(s));
