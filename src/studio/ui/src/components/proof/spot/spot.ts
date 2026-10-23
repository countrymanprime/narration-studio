// Takes at a flagged spot, as Proof shows them (Studio Next mock: src/selectors/proofTakes.ts). Read-only: a note whose spot (the
// passage it points at) has several takes gets a count, the other takes as thinner lanes under the waveform, and a list in the
// Inspector. Choosing, keeping or hiding takes is Editing's. The take list is the host's `workspaceTakes` read, in the order the
// Takes panel lists it, so the count and the order match Editing's.
import type { PassageTake, WorkspaceAlignmentResult, WorkspaceTakesResult, WorkspaceToken } from '../../../api/contracts/workspace';

export type SpotTake = {
  id: string;
  /** "Take 1": the take's place in the host's list for this spot. */
  label: string;
  n: number;
  /** Project seconds where the take sits on the timeline, and how long it plays. */
  start: number;
  len: number;
  sourceFile: string;
  sourceStart: number;
  sourceLength: number;
  /** What the check heard in the take; only the active take has it (the alignment is of the active reads). */
  heard: string | undefined;
  /** The take that plays now, and whether it is the narrator's choice (the host's active take is the one kept). */
  active: boolean;
  kept: boolean;
  /** Not usable: dimmed in the lanes and not playable; `reason` is the host's words. */
  hidden: boolean;
  reason: string | undefined;
};

export type Spot = { chapterId: string; passageId: string; script: string; takes: SpotTake[] };

/** The passage a note points at: the first and last token of its paragraph, from the chapter's alignment. Undefined without a paragraph or tokens. */
export function passageOf(
  alignment: Pick<WorkspaceAlignmentResult, 'tokens'>,
  paragraphId: string | undefined,
): { firstToken: number; lastToken: number } | undefined {
  if (!paragraphId) return undefined;
  const own = alignment.tokens.filter((token) => token.p === paragraphId);
  if (own.length === 0) return undefined;
  return { firstToken: own[0].i, lastToken: own[own.length - 1].i };
}

/** The words the check heard in a passage: a read word as written, a misread one as said, a skipped one not at all. */
export function heardText(tokens: readonly WorkspaceToken[], firstToken: number, lastToken: number): string {
  return tokens
    .filter((token) => token.i >= firstToken && token.i <= lastToken)
    .map((token) => (token.status === 'misread' ? (token.heard ?? '') : token.status === 'read' || token.status === 'short_read' ? token.text : ''))
    .filter(Boolean)
    .join(' ');
}

const take = (candidate: PassageTake, n: number, at: number, heard: string | undefined): SpotTake => ({
  id: candidate.id,
  label: `Take ${n}`,
  n,
  start: at,
  len: candidate.sourceLength,
  sourceFile: candidate.sourceFile,
  sourceStart: candidate.sourceStart,
  sourceLength: candidate.sourceLength,
  heard: candidate.active ? heard : undefined,
  active: candidate.active,
  kept: candidate.active,
  hidden: !candidate.usable,
  reason: candidate.usable ? undefined : candidate.reason,
});

/**
 * The several takes at a spot; null when the spot has fewer than two, so nothing extra is drawn. `at` is where the passage starts on
 * the timeline (the alternates of one line start together); `heard` is what the check heard in the active take.
 */
export function spotOf(result: WorkspaceTakesResult, context: { script: string; at: number; heard?: string }): Spot | null {
  if (result.candidates.length < 2) return null;
  return {
    chapterId: result.chapterId,
    passageId: result.passageId,
    script: context.script,
    takes: result.candidates.map((candidate, index) => take(candidate, index + 1, context.at, context.heard)),
  };
}

/** How many takes each note's spot has, for the notes that have several. `spots` is by note id. */
export function takeCounts(spots: ReadonlyMap<string, Spot | null>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [id, spot] of spots) if (spot) counts.set(id, spot.takes.length);
  return counts;
}

const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

/** What a take heard against the script, as `<del>`/`<ins>` markup (the Inspector's markup): script words not said struck, words said that are not in the script marked. */
export function heardMarkup(script: string, heard: string): string {
  const a = wordsOf(script);
  const b = wordsOf(heard);
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push(escapeText(a[i]));
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1])) out.push(`<del>${escapeText(a[i++])}</del>`);
    else out.push(`<ins>${escapeText(b[j++])}</ins>`);
  }
  return out.join(' ');
}
