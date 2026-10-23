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
export function noAudioText(audio: Exclude<ChapterAudio, { kind: 'ready' }>, chapter: string, daw: string | null): NoAudioText {
  if (daw === null) {
    return {
      headline: `Nothing is recorded for ${chapter} yet, so there is no audio to edit.`,
      next: 'Record it in the Booth, then edit it here.',
    };
  }
  switch (audio.kind) {
    case 'unlinked':
      return {
        headline: `${chapter} is not linked to a track in ${daw}, so there is no audio to edit.`,
        next: 'The script is shown without what was heard.',
      };
    case 'missing':
      return {
        headline: `${chapter}’s linked track is not in the saved project, so there is no audio to edit.`,
        next: 'The script is shown without what was heard.',
      };
    case 'empty':
      return {
        headline: `${chapter}’s track has no audio on it, so there is nothing to edit.`,
        next: `Record or import the chapter onto that track in ${daw}, then save the project.`,
      };
  }
}
