// The Story Bible's extraction suggestions (ADR 0803, ADR 0846): what a source offered, each with the quote that backs it and the
// status the 75% rule gave it. They are kept in the project's ManuscriptGuide/suggestions.json (apps/desktop/internal/extraction/store)
// and applied to the Story Bible through its own commands (apps/desktop/internal/extraction/apply), so a locked entry is never changed.
// The shapes follow the Studio Next mock's src/domain/extraction.ts.

export const SUGGESTION_KINDS = ['entry', 'alias', 'property', 'relationship', 'claim', 'speaker'] as const;
export const SUGGESTION_STATUSES = ['accepted-auto', 'needs-verification', 'accepted', 'rejected'] as const;
export const SUGGESTION_SOURCES = ['rules', 'imported', 'local-model', 'gliner', 'booknlp'] as const;
export const CLAIM_KINDS = ['talk', 'act', 'know'] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number];
export type ClaimKind = (typeof CLAIM_KINDS)[number];

/** The most UTF-8 bytes one text holds (the store's field cap, ADR 0846); the host refuses a longer edit. */
export const SUGGESTION_TEXT_MAX_BYTES = 8192;

/** A quoted stretch of one paragraph. start and end are UTF-16 units into its text, computed by the host, never by a source. */
export type SuggestionEvidence = { paragraphId: string; start: number; end: number; text: string };

/** What each kind offers. An entry reference is an entry's id, name or any of its names. Empty lists are left out. */
export type SuggestionPayload =
  | { kind: 'entry'; name: string; type?: string; aliases?: string[]; description?: string; appearsIn?: string[] }
  | { kind: 'alias'; entry: string; alias: string }
  | { kind: 'property'; entry: string; key: string; value: string }
  | { kind: 'relationship'; entry: string; to: string; relation: string }
  | { kind: 'claim'; entry: string; claim: ClaimKind; text: string }
  | { kind: 'speaker'; quote: string; speaker: string };

/** What applying a suggestion changed in the Story Bible, so rejecting it can take that back. */
export type SuggestionApplied = { entryId?: string; created?: boolean; aliases?: string[]; relId?: number; phraseKey?: string };

export type ExtractionSuggestion = {
  id: string;
  kind: SuggestionKind;
  payload: SuggestionPayload;
  /** The entry this belongs to, once the Story Bible has one. */
  entryId: string | null;
  evidence: SuggestionEvidence[];
  /** 0..1, or null when the source gave none (never made up). */
  confidence: number | null;
  source: SuggestionSource;
  status: SuggestionStatus;
  /** The quote a source gave that is not in the manuscript. */
  unverifiedQuote?: string;
  /** Why it needs verification, or why it could not be applied. */
  reason?: string;
  /** The fingerprint of what was first offered: a rejected one stays as a tombstone so it is not offered again. */
  fp: string;
  /** The source thinks it repeats something else; the note says what. */
  flag?: 'duplicate';
  note?: string;
  /** The chapter a claim holds in. */
  chapterId?: string;
  applied?: SuggestionApplied;
  createdAt: string;
};

/** What a decision did: the suggestion as it is now, the other suggestions it settled (a new entry lets a waiting claim attach), and the
 * ids of the Story Bible entries it changed. */
export type ExtractionDecision = {
  suggestion: ExtractionSuggestion;
  settled: ExtractionSuggestion[];
  entryIds: string[];
};

/** One extraction source as the scan sees it, in the registry's order (rules first). `runs` is false for a source the narrator does not
 * start (an imported file); `reason`, when it is not available, is a sentence that says why ("GLiNER is not downloaded."). */
export type ExtractionSource = { id: SuggestionSource; label: string; icon: string; runs: boolean; available: boolean; reason?: string };

/** The scan as a host job, in the shape of the other host jobs (`WorkJob`): `percent` is the sources done over the sources it runs and
 * reads 100 only once it has ended (ADR 0015); `sources` are the ones it runs, rules first; `added` and `skipped` count the suggestions
 * stored and the ones dropped as offered or rejected before. It ends with one `job:ended` event of kind `extraction_scan` (ADR 0076). */
export type ExtractionScanJob = {
  id: string | null;
  kind: 'extraction_scan';
  phase: 'idle' | 'running' | 'success' | 'cancelled' | 'error';
  message: string;
  percent: number;
  logs: string[];
  elapsed: number;
  error?: string;
  sources: SuggestionSource[];
  added: number;
  skipped: number;
};

/** A refusal (a locked entry, a name another entry owns, an unknown id) rejects with the sentence and changes nothing. */
export interface ExtractionApi {
  /** Every suggestion, rejected ones included: entries first, then names, relationships, properties and claims, speakers. */
  extractionList(): Promise<ExtractionSuggestion[]>;
  /** Makes a suggestion the narrator's and applies it. `text`, when given, replaces what it says (an entry's name, a name, a value, a
   * relation, a claim or a speaker), trimmed. */
  extractionAccept(id: string, text?: string): Promise<ExtractionDecision>;
  /** Takes back what a suggestion changed and keeps it as a tombstone. */
  extractionReject(id: string): Promise<ExtractionDecision>;
  /** Makes an automatic acceptance the narrator's and clears the Review flag it set; refused on one that needs verification. */
  extractionReview(id: string): Promise<ExtractionDecision>;
  /** The undo of accept, reject and review: back to the status the rule gives it now, an automatic acceptance applied and flagged
   * Review, one that needs verification with what the decision applied taken back. An edited text stays as edited. */
  extractionReopen(id: string): Promise<ExtractionDecision>;
  /** Every extraction source, rules first, with whether it can run now and why not. */
  extractionSources(): Promise<ExtractionSource[]>;
  /** Starts a scan: the rules, then each of `sourceIds` in the registry's order; one that cannot run is skipped with its reason in the
   * job's logs. While a scan runs this returns that scan. An id that is not a source a scan can start is refused before anything starts. */
  extractionScan(sourceIds: SuggestionSource[]): Promise<ExtractionScanJob>;
  /** The running or last scan, or an idle one. */
  extractionScanState(): Promise<ExtractionScanJob>;
  /** Stops the running scan and the source it is running; what the sources that finished added is kept. */
  extractionScanCancel(): Promise<ExtractionScanJob>;
}
