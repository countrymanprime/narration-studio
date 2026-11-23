import { linkStateLabel } from '../chapterTracks/chapterLink';
import { trackName as readable } from '../tracks/trackName';
import { isolatedIfRtl } from '../../visibleText';
import type { ChapterTrackCreateResult } from '../../api/contracts/chapterTrackMap';
import type { VoiceTracksLayout } from '../../api/contracts/voiceTracks';

/** What the DAW made for a chapter, as `ChapterTrackCreate` answers: `voice` is the Narrator inside a new chapter folder, absent for a plain track. */
export type CreatedDestination = Pick<Extract<ChapterTrackCreateResult, { outcome: 'created' }>, 'voice' | 'children' | 'message'> & {
  track: { name: string; index?: number };
};

/** What a chapter's link points at, as far as the project's tracks say: nothing, a plain track, a folder with no voices, or a track they do not hold yet. */
/** The one sentence for a link to a track the project does not hold; the host (linkGoneSentence in bindings_booth_voice.go) and the Booth mock say the same. */
export const LINK_GONE = 'This chapter’s track is gone from the project, so no voice is listed. Link it in the audio engine panel.';

/** The sentence while the project's tracks have not been read (the first read has not answered or failed): the chapter's link is not known to be missing. */
export const TRACKS_UNREAD = 'The tracks are still being read, so there is no voice to choose yet. Try again in a moment.';

export type ChapterLinkKind = 'none' | 'track' | 'empty' | 'marked' | 'unknown' | 'unread';

/**
 * The words for where a chapter records, from the project's layout (the Voice folders setting): a chapter is a track in a flat project and a
 * folder of voice tracks in a Voice folders one. Every message that names what a chapter is linked to, records on or is waiting for gets its
 * noun here, so a flat sentence cannot show on a folders project or the other way round (#3271). What the DAW made is named from its answer
 * (`created`), not from the layout, because an engine with no folder tracks adds a plain track in a folders project.
 */
export function destinationFor(layout: VoiceTracksLayout) {
  const folders = layout === 'folders';
  const noun = folders ? 'folder' : 'track';
  const Noun = folders ? 'Folder' : 'Track';
  const a = folders ? 'a folder of voice tracks' : 'a track';
  return {
    folders,
    noun,
    /** The noun capitalised, for a label or a title ("Folder for Chapter 1"). */
    Noun,
    /** "a track" or "a folder of voice tracks". */
    a,
    notLinkedTitle: (chapter: string) => `${chapter} is not linked to a ${noun}`,
    severalTitle: (chapter: string) => `${chapter} is linked to more than one ${noun}`,
    missingTitle: (chapter: string) => `${chapter}’s ${noun} is not in the project`,
    notLinkedChip: `Not linked to a ${noun}`,
    severalChip: folders ? 'Linked to several folders' : 'Linked to several tracks',
    missingChip: linkStateLabel('missing', folders),
    linkButton: `Link ${noun}`,
    pickerLabel: (chapter: string) => `${Noun} for ${chapter}`,
    /** The Link button's reason beside a picker with nothing chosen. */
    chooseFirst: `Choose a ${noun} first`,
    /** Why a pickup's original cannot be played: the chapter has no link, or its linked track is gone. */
    noOriginal: {
      unlinked: `This chapter is not linked to a ${noun}, so the original cannot be played.`,
      missing: `This chapter’s linked ${noun} is no longer in the project, so the original cannot be played.`,
    },
    /** The Engine row's and the mapping dialog's line for a link whose track the project no longer has. */
    linkedMissing: `Linked ${noun} is missing from this project`,
    /** Why a chapter has no measured recording, for the Proof check card. */
    noRecordingWhy: {
      unlinked: `No ${noun} is linked to it.`,
      multiple_tracks: `More than one ${noun} is linked to it.`,
      track_missing: `Its linked ${noun} is not in the saved project.`,
    },
    /** The Booth dialog's sentence while Record waits for a link. */
    recordWaits: (chapter: string) => `Record can't start until ${chapter} has ${a} to record on.`,
    recordWaitsMissing: (chapter: string) => `Record can't start until ${chapter} is linked to ${a} that is in the project.`,
    recordWaitsSeveral: (chapter: string) => `Record can't start: a take needs exactly one ${noun} for ${chapter}. Linking one replaces the others.`,
    /** The footer's reason beside Record. */
    footerMissing: (chapter: string) => `${chapter}’s ${noun} is not in the project. Press Record to link one.`,
    footerNoLink: (chapter: string) => `${chapter} has no ${noun} to record on. Press Record to link one.`,
    linkedToast: (chapter: string) => `${isolatedIfRtl(chapter)} is linked to its ${noun}. Press Record when you are ready.`,
    /** The setup chip's words and tooltip sentence for a chapter with no link or several. */
    chipNoTrack: { words: `no ${noun}`, sentence: `this chapter has no ${noun} to record on` },
    chipMissing: { words: linkStateLabel('missing', folders).toLowerCase(), sentence: `this chapter’s ${noun} is not in the project` },
    chipSeveral: { words: folders ? 'several folders' : 'several tracks', sentence: `this chapter is linked to several ${noun}s` },
    /**
     * A voice key pressed where no voice is listed, and why, by what the chapter is linked to: nothing (`none`), a track that is not a folder (`track`),
     * a folder holding no voices yet (`empty`), a folder whose every track is marked as not a voice (`marked`), or a track the project does not hold (`unknown`: deleted in the DAW, or a folder just made that is not saved yet), or tracks not read yet (`unread`).
     */
    noVoiceKeys: (link: ChapterLinkKind) => {
      // One sentence in either layout for a link to a track the project does not hold, as the host says it and the Engine panel's "Track missing" (#3269).
      if (link === 'unknown') return LINK_GONE;
      if (link === 'unread') return TRACKS_UNREAD;
      // Every track of the linked folder turned off as not a voice: refused in either layout, naming the switch (#3828).
      if (link === 'marked')
        return folders
          ? 'Every track in this chapter’s folder is turned off as not a voice. Turn one on in the Voices card.'
          : 'Every track is off as not a voice. Turn one on in the Voices card or link one in the audio engine panel.';
      if (!folders) return 'This chapter records on one track, so voice keys do nothing. Link a folder in the audio engine panel.';
      switch (link) {
        case 'none':
          return 'This chapter is not linked to a folder of voices. Link or create one in the audio engine panel.';
        case 'track':
          return 'This chapter has one track, not a folder of voices. Link a folder in the audio engine panel.';
        case 'empty':
          return 'This chapter’s folder has no voice tracks yet, so there is no voice to choose. Add one in REAPER.';
      }
    },
    /** The Editing note for a chapter with no link. */
    editingUnlinked: (chapter: string, daw: string) => `${chapter} is not linked to a ${noun} in ${daw}, so there is no audio to edit.`,
  };
}

/** The names of the tracks a new folder was made with, "Narrator, Alice and Extras", when it has more than the Narrator; null for a plain track or a folder with only its Narrator. */
export function childNames(created: CreatedDestination): string | null {
  const names = (created.children ?? []).map((child) => child.name);
  if (names.length < 2) return null;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * What the DAW made, named as it was given (a folder or a track), that it is linked to the chapter, and that it is not saved yet; and, when the create was partly done, what is left (the host's sentence).
 * Shorter than it was (#4095): it named the track and the chapter twice, the DAW and the tracks inside a folder, and ran to 138 characters, past the toast's two lines (`TOAST_CHAR_BUDGET`) with the mock's own chapter name; the chapter and the folder's tracks are on screen in the dialog and the engine panel the narrator just used.
 * A toast fits two lines when the name is about 26 characters or fewer; a longer one scrolls inside it, which is the narrator's own name for the track. The tracks the folder holds are named in the engine panel.
 */
export function createdSentence(created: CreatedDestination, dawName: string): string {
  const what = `${created.voice ? 'Folder' : 'Track'} “${isolatedIfRtl(readable(created.track.name, created.track.index))}”`;
  return `${what} is in ${dawName}, linked here. Save the ${dawName} project to keep it.${created.message ? ` ${created.message}` : ''}`;
}
