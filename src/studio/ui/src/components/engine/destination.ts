import type { ChapterTrackCreateResult } from '../../api/contracts/chapterTrackMap';
import type { VoiceTracksLayout } from '../../api/contracts/voiceTracks';

/** What the DAW made for a chapter, as `ChapterTrackCreate` answers: `voice` is the Narrator inside a new chapter folder, absent for a plain track. */
export type CreatedDestination = Pick<Extract<ChapterTrackCreateResult, { outcome: 'created' }>, 'voice'> & { track: { name: string } };

/** What a chapter's link points at, as far as the project's tracks say: nothing, a plain track, a folder with no voices, or a track they do not hold yet. */
export type ChapterLinkKind = 'none' | 'track' | 'empty' | 'unknown';

/**
 * The words for where a chapter records, from the project's layout (the Voice folders setting): a chapter is a track in a flat project and a
 * folder of voice tracks in a Voice folders one. Every message that names what a chapter is linked to, records on or is waiting for gets its
 * noun here, so a flat sentence cannot show on a folders project or the other way round (#3271). What the DAW made is named from its answer
 * (`created`), not from the layout, because an engine with no folder tracks adds a plain track in a folders project.
 */
export function destinationFor(layout: VoiceTracksLayout) {
  const folders = layout === 'folders';
  const noun = folders ? 'folder' : 'track';
  const a = folders ? 'a folder of voice tracks' : 'a track';
  return {
    folders,
    noun,
    /** "a track" or "a folder of voice tracks". */
    a,
    notLinkedTitle: (chapter: string) => `${chapter} is not linked to a ${noun}`,
    severalTitle: (chapter: string) => `${chapter} is linked to more than one ${noun}`,
    missingTitle: (chapter: string) => `${chapter}’s ${noun} is not in the project`,
    notLinkedChip: `Not linked to a ${noun}`,
    severalChip: folders ? 'Linked to several folders' : 'Linked to several tracks',
    linkButton: `Link ${noun}`,
    pickerLabel: (chapter: string) => `${folders ? 'Folder' : 'Track'} for ${chapter}`,
    /** The Booth dialog's sentence while Record waits for a link. */
    recordWaits: (chapter: string) => `Record can't start until ${chapter} has ${a} to record on.`,
    recordWaitsSeveral: (chapter: string) => `Record can't start: a take needs exactly one ${noun} for ${chapter}. Linking one replaces the others.`,
    /** The footer's reason beside Record. */
    footerNoLink: (chapter: string) => `${chapter} has no ${noun} to record on. Press Record to link one.`,
    linkedToast: (chapter: string) => `${chapter} is linked to its ${noun}. Press Record when you are ready.`,
    /** The setup chip's words and tooltip sentence for a chapter with no link or several. */
    chipNoTrack: { words: `no ${noun}`, sentence: `this chapter has no ${noun} to record on` },
    chipSeveral: { words: folders ? 'several folders' : 'several tracks', sentence: `this chapter is linked to several ${noun}s` },
    /**
     * A voice key pressed where no voice is listed, and why, by what the chapter is linked to: nothing (`none`), a track that is not a folder (`track`),
     * a folder holding no voices yet (`empty`), or something the saved project does not hold yet (`unknown`: a folder just made, its voices still being read).
     */
    noVoiceKeys: (link: ChapterLinkKind) => {
      if (!folders) return 'This chapter records on one track. Voice keys choose a voice for a chapter linked to a folder of voices (the audio engine panel).';
      switch (link) {
        case 'none':
          return 'This chapter is not linked to a folder of voices yet, so there is no voice to choose. Link or create its folder first.';
        case 'track':
          return 'This chapter is linked to a single track, not a folder of voices, so there is no voice to choose. Link its folder in the audio engine panel.';
        case 'empty':
          return 'This chapter’s folder has no voice tracks yet, so there is no voice to choose. Add a track inside it in REAPER.';
        case 'unknown':
          return 'This chapter’s voices are still being read, so there is no voice to choose yet. Try again in a moment.';
      }
    },
    /** The Editing note for a chapter with no link. */
    editingUnlinked: (chapter: string, daw: string) => `${chapter} is not linked to a ${noun} in ${daw}, so there is no audio to edit.`,
  };
}

/** What the DAW made, named as it was given: a folder with its Narrator, or the track; and that it is not saved yet. */
export function createdSentence(created: CreatedDestination, chapter: string, dawName: string): string {
  const what = created.voice ? `Folder “${created.track.name}” with a ${created.voice.name} track` : `Track “${created.track.name}”`;
  return `${what} added in ${dawName} and linked to ${chapter}. Save the ${dawName} project to keep it.`;
}
