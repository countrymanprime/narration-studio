import type { ChapterLinkState } from '../../chapterTracks/chapterLink';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { recorderName, recorderNameCapital, wrongProjectReason } from '../../../studio/dawNames';

/** What the host says of the chapter's track (`readAloudReaperState`): how many it has, and its own sentence for the ones that stop a take. */
export type ChapterRecordState = {
  /** `unread` until the host has answered; Record is then left to the host's own refusal at the press. */
  tracks: 'unread' | ChapterLinkState;
  message: string;
  /** The DAW is already recording a take this app did not start (`recording_elsewhere`): a second start would fight it, so Record says so first. */
  elsewhere?: boolean;
  /** With `elsewhere`: why the take is not followed, which the sentence says. */
  notFollowed?: NotFollowedWhy | null;
};

/** Why the Booth does not follow a take the DAW holds: another track is armed, several are, none is, or the lane could not be read yet. */
export type NotFollowedWhy = 'other_track' | 'several_tracks' | 'no_track_armed' | 'unread';
/** The reason the Booth is not following the take, after "the DAW is recording"; the one place these words are written (the footer, the chip's tooltip). */
export const NOT_FOLLOWED_CLAUSE: Record<Exclude<NotFollowedWhy, 'unread'>, string> = {
  other_track: 'on another track, so the Booth is not following it',
  several_tracks: 'with several tracks armed, so the Booth is not following it',
  no_track_armed: 'with no track armed, so the Booth is not following it',
};

/** Whether the project the DAW has open is the one linked here. `unknown` while nothing is linked or the DAW has not been heard (the host reports no match then). */
export type OpenProject = 'same' | 'different' | 'unknown';

export type RecordRefusal = { code: 'capability' | 'wrong_project' | 'recording_elsewhere' | 'no_track' | 'several_tracks' | 'track_missing'; reason: string };

/**
 * Why Record cannot start in this chapter, or null. Every sentence is the capability's own or the host's refusal, none is
 * worded here. A chapter has to have exactly one track only when the setup reads tracks (`track_state`); a setup that records
 * without a project has no track to count. A new refusal is another capability or another host sentence, not a new branch.
 */
export function recordCheck(capabilities: DawCapabilities, chapter: ChapterRecordState, openProject: OpenProject = 'unknown'): RecordRefusal | null {
  const record = capabilities.capabilities.record;
  // The capability's own sentence; a host that sends none (or no `record` entry at all, an older one) still gets a reason, never a silent Record.
  if (!record?.available) {
    return { code: 'capability', reason: record?.message || `Recording is not available in ${recorderName(capabilities.daw)} right now.` };
  }
  // A take goes into the project the DAW has open: if that is not the linked one it would land in the wrong project, so say so before it does.
  if (openProject === 'different') {
    // A take running in it (the DAW recording in the other project) is part of what the narrator must know before fixing the project.
    return {
      code: 'wrong_project',
      reason: `${wrongProjectReason(capabilities.daw)}${chapter.elsewhere ? ` ${recorderNameCapital(capabilities.daw)} is recording a take now.` : ''}`,
    };
  }
  if (chapter.elsewhere) {
    const name = recorderNameCapital(capabilities.daw);
    const why = chapter.notFollowed && chapter.notFollowed !== 'unread' ? ` ${NOT_FOLLOWED_CLAUSE[chapter.notFollowed]}` : '';
    return { code: 'recording_elsewhere', reason: `${name} is already recording${why}. Stop it in ${name} before recording here.` };
  }
  if (!capabilities.capabilities.track_state?.available) return null;
  if (chapter.tracks === 'unlinked') return { code: 'no_track', reason: chapter.message };
  if (chapter.tracks === 'several') return { code: 'several_tracks', reason: chapter.message };
  if (chapter.tracks === 'missing') return { code: 'track_missing', reason: chapter.message };
  return null;
}
