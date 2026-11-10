import type { VoiceTracksLayout } from '../../../api/contracts/voiceTracks';
import { destinationFor } from '../../engine/destination';
import type { ChapterAudio } from './chapterSource';

/** The words of the notice over a chapter that has no audio to edit: what is wrong, and what to do about it. */
export interface NoAudioText {
  headline: string;
  next: string;
}

/**
 * Why a chapter shows no audio and the way forward, in one place so the notice and the link dialog say the same thing. `daw` is the DAW's own
 * name, or null for the built-in recorder, which has no track to link: nothing is recorded there until the narrator records it.
 */
export function noAudioText(
  audio: Exclude<ChapterAudio, { kind: 'ready' }>,
  chapter: string,
  daw: string | null,
  layout: VoiceTracksLayout = 'flat',
): NoAudioText {
  if (daw === null) {
    return {
      headline: `Nothing is recorded for ${chapter} yet, so there is no audio to edit.`,
      next: 'Record it in the Booth, then edit it here.',
    };
  }
  switch (audio.kind) {
    case 'unlinked':
      return {
        headline: destinationFor(layout).editingUnlinked(chapter, daw),
        next: 'The script is shown without what was heard.',
      };
    case 'missing':
      return {
        headline: `${chapter}’s linked track is not in the saved project, so there is no audio to edit.`,
        next: 'The script is shown without what was heard.',
      };
    case 'empty':
      if (audio.unsaved === 'unknown')
        return {
          headline: `${chapter} has no saved audio, and ${daw} did not say if it has unsaved changes.`,
          next: `Save the project in ${daw}, then read again.`,
        };
      if (audio.unsaved && audio.missing)
        return {
          headline: `${chapter}’s track is not in the saved project, and ${daw} has unsaved changes.`,
          next: `It may have been added since the last save. Save the project in ${daw}, then read again.`,
        };
      if (audio.unsaved)
        return {
          headline: `${chapter} has no saved audio, and ${daw} has unsaved changes.`,
          next: `A recording may be waiting there. Save the project in ${daw}, then read again.`,
        };
      if (audio.folder)
        return {
          headline: `${chapter}’s folder has no audio on any of its voice tracks, so there is nothing to edit.`,
          next: `Record the chapter onto a voice track inside that folder in ${daw}, then save the project.`,
        };
      return {
        headline: `${chapter}’s track has no audio on it, so there is nothing to edit.`,
        next: `Record or import the chapter onto that track in ${daw}, then save the project.`,
      };
  }
}
