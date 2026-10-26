// The words of the recording check (docs/utilities/recording-coverage.md): every reason the host can give
// for a check it refused or a result it cannot trust, in the narrator's terms, and the small formatters the pages share.
// Pure functions, so the dialog only lays them out.
import type { ChapterStatus, CoverageReason, ManuscriptChapter } from '../../types';
import type { CreditsKind } from '../credits/useCreditsRows';

/**
 * One plain sentence per reason. The host also sends its own message with a refusal, but that one is written for a log
 * (it can name an item GUID), so it is shown only as the detail under this sentence.
 */
export const COVERAGE_REASON_TEXT: Record<CoverageReason, string> = {
  no_project: 'Open a project first.',
  no_project_file: 'Choose the saved REAPER project file on the Tracks page first.',
  project_unreadable: 'The saved REAPER project file could not be read. Save it again in REAPER.',
  no_manuscript: 'Import a manuscript first.',
  chapter_not_found: 'This chapter is no longer in the manuscript.',
  not_narration: 'Only chapters are checked, not reference sections.',
  unmapped: 'Link this chapter to the REAPER track it is recorded on first.',
  multiple_tracks: 'This chapter is linked to more than one REAPER track. Keep one link on the Tracks page.',
  mapped_track_missing: 'The REAPER track this chapter is linked to is no longer in the saved project. Clear the link and link it again on the Tracks page.',
  no_items: 'The chapter’s track has no audio in the saved project.',
  unsupported_item: 'An item on the chapter’s track is not an audio file the check can read.',
  source_missing: 'An audio file on the chapter’s track is missing.',
  item_unreadable: 'An audio file on the chapter’s track could not be read.',
  busy: 'Another recording check is running. Wait for it to finish.',
  sidecar_missing: 'Set up the Transcript Compare tool in Settings first.',
  invalid_params: 'The recording check settings are not valid.',
  manuscript_changed: 'The chapter’s text changed since this check.',
  result_missing: 'The result of the last check could not be read. Check again.',
  credits_not_set_up: 'Add a template for this in Settings > Project > Credits before checking it.',
  credits_changed: 'The credits text changed since this check.',
  item_added: 'Audio was added to the chapter’s track since this check.',
  item_removed: 'Audio was removed from the chapter’s track since this check.',
  item_trimmed: 'An item on the chapter’s track was trimmed since this check.',
  item_moved: 'An item on the chapter’s track was moved since this check.',
  item_muted: 'An item on the chapter’s track was muted or unmuted since this check.',
  take_switched: 'A different take was chosen on the chapter’s track since this check.',
  source_changed: 'An audio file on the chapter’s track changed since this check.',
  analyzer_changed: 'The recording check itself was updated since this check.',
  params_changed: 'The recording check settings changed since this check.',
  mapping_changed: 'The chapter was linked to a different track since this check.',
};

/**
 * The reasons a narrator answers by linking the chapter to a track, right there in the dialog. Only a
 * chapter with no link at all: a link to a missing track has to be cleared first, or a new one would make two, so that one goes to Tracks.
 */
export const LINK_REASONS: ReadonlySet<CoverageReason> = new Set(['unmapped']);

/** Where a reason that is not answered in the dialog is fixed, as a page the dialog can link to. */
export const REASON_PAGE: Partial<Record<CoverageReason, { path: string; label: string }>> = {
  no_project_file: { path: '/tracks', label: 'Open Tracks' },
  multiple_tracks: { path: '/tracks', label: 'Open Tracks' },
  mapped_track_missing: { path: '/tracks', label: 'Open Tracks' },
  sidecar_missing: { path: '/settings', label: 'Open Settings' },
  credits_not_set_up: { path: '/settings', label: 'Open Settings' },
};

// The row labels the credits-in-chapter-table board and Manuscript's CreditsEntry both show.
const CREDITS_CHECK_TITLE: Record<CreditsKind, string> = { opening: 'Opening credits', closing: 'Closing credits' };

/** The `credits-<kind>` id a credits row's check runs and reads under, matching the host's
 * `coverage.CreditsChapterID`. */
const creditsCheckId = (kind: CreditsKind): string => `credits-${kind}`;

/**
 * The synthetic `ManuscriptChapter` a credits row's check hands Check recordings (`openCheckRecordings`'s `extra`): the dialog treats `chapter.id` as an opaque key for every host call, so this
 * needs nothing beyond a title and the one paragraph id the host's synthetic check manuscript gives the credits kind
 * (`coverage.creditsParagraphID`, `"<chapterId>-p0"`), so a reported gap numbers as "paragraph 1" the same way a real
 * chapter's first paragraph would. Never inserted into the real chapters array (docs/architecture/manuscript-teleprompter.md: credits are not manuscript
 * chapters) - it exists only for the seconds this dialog is open.
 */
export function creditsCheckChapter(kind: CreditsKind, status: ChapterStatus): ManuscriptChapter {
  const id = creditsCheckId(kind);
  return { id, title: CREDITS_CHECK_TITLE[kind], index: 0, wordCount: 0, status, paragraphIds: [{ id: `${id}-p0`, index: 0 }] };
}

export const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** "0:07", "3:05", "1:02:09": a position in an audio file. */
export function formatAudioTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** A paragraph's number within its chapter (1 is the chapter's first paragraph) and its index in the whole manuscript, for a link. */
type ParagraphRef = { number: number; index?: number };

export function paragraphRefs(chapter: ManuscriptChapter, ids: string[]): ParagraphRef[] {
  const order = chapter.paragraphIds ?? [];
  return ids.map((id, fallback) => {
    const position = order.findIndex((paragraph) => paragraph.id === id);
    return position < 0 ? { number: fallback + 1 } : { number: position + 1, index: order[position].index };
  });
}

/** "paragraph 12", "paragraphs 38 to 40", "paragraphs 3, 5 and 9". */
export function describeParagraphs(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  if (sorted.length === 0) return 'no paragraph';
  if (sorted.length === 1) return `paragraph ${sorted[0]}`;
  const consecutive = sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
  if (consecutive) return `paragraphs ${sorted[0]} to ${sorted[sorted.length - 1]}`;
  return `paragraphs ${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`;
}

/** "Checked 21 Sep 2026, 10:00" in the narrator's locale; the raw value when it is not a date. */
export function formatWhen(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
