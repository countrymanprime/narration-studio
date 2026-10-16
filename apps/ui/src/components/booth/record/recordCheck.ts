import type { DawCapabilities } from '../../../api/contracts/daw';

/** What the host says of the chapter's track (`readAloudReaperState`): how many it has, and its own sentence for the ones that stop a take. */
export type ChapterRecordState = {
  /** `unread` until the host has answered; Record is then left to the host's own refusal at the press. */
  tracks: 'unread' | 'none' | 'one' | 'several';
  message: string;
  /** The DAW is already recording a take this app did not start (`recording_elsewhere`): a second start would fight it, so Record says so first. */
  elsewhere?: boolean;
};

/** Whether the project the DAW has open is the one linked here. `unknown` while nothing is linked or the DAW has not been heard (the host reports no match then). */
export type OpenProject = 'same' | 'different' | 'unknown';

export type RecordRefusal = { code: 'capability' | 'wrong_project' | 'recording_elsewhere' | 'no_track' | 'several_tracks'; reason: string };

/**
 * Why Record cannot start in this chapter, or null. Every sentence is the capability's own or the host's refusal, none is
 * worded here. A chapter has to have exactly one track only when the setup reads tracks (`track_state`); a setup that records
 * without a project has no track to count. A new refusal is another capability or another host sentence, not a new branch.
 */
export function recordCheck(capabilities: DawCapabilities, chapter: ChapterRecordState, openProject: OpenProject = 'unknown'): RecordRefusal | null {
  const record = capabilities.capabilities.record;
  // The capability's own sentence; a host that sends none (or no `record` entry at all, an older one) still gets a reason, never a silent Record.
  if (!record?.available) {
    const name = capabilities.daw === 'none' ? 'the DAW' : capabilities.daw;
    return { code: 'capability', reason: record?.message || `Recording is not available in ${name} right now.` };
  }
  // A take goes into the project the DAW has open: if that is not the linked one it would land in the wrong project, so say so before it does.
  if (openProject === 'different') {
    const name = capabilities.daw === 'none' ? 'The DAW' : capabilities.daw;
    return {
      code: 'wrong_project',
      reason: `${name} has a different project open than the one linked here. Open the linked project in ${name}, or link the open one in Settings.`,
    };
  }
  if (chapter.elsewhere) {
    const name = capabilities.daw === 'none' ? 'The DAW' : capabilities.daw;
    return { code: 'recording_elsewhere', reason: `${name} is already recording. Stop it in ${name} before recording here.` };
  }
  if (!capabilities.capabilities.track_state?.available) return null;
  if (chapter.tracks === 'none') return { code: 'no_track', reason: chapter.message };
  if (chapter.tracks === 'several') return { code: 'several_tracks', reason: chapter.message };
  return null;
}
