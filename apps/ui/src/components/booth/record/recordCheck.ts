import type { DawCapabilities } from '../../../api/contracts/daw';

/** What the host says of the chapter's track (`readAloudReaperState`): how many it has, and its own sentence for the ones that stop a take. */
export type ChapterRecordState = {
  /** `unread` until the host has answered; Record is then left to the host's own refusal at the press. */
  tracks: 'unread' | 'none' | 'one' | 'several';
  message: string;
};

export type RecordRefusal = { code: 'capability' | 'no_track' | 'several_tracks'; reason: string };

/**
 * Why Record cannot start in this chapter, or null. Every sentence is the capability's own or the host's refusal, none is
 * worded here. A chapter has to have exactly one track only when the setup reads tracks (`track_state`); a setup that records
 * without a project has no track to count. A new refusal is another capability or another host sentence, not a new branch.
 */
export function recordCheck(capabilities: DawCapabilities, chapter: ChapterRecordState): RecordRefusal | null {
  const record = capabilities.capabilities.record;
  if (!record?.available) return { code: 'capability', reason: record?.message ?? '' };
  if (!capabilities.capabilities.track_state?.available) return null;
  if (chapter.tracks === 'none') return { code: 'no_track', reason: chapter.message };
  if (chapter.tracks === 'several') return { code: 'several_tracks', reason: chapter.message };
  return null;
}
