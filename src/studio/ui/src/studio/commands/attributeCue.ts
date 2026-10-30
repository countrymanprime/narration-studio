import { apiErrorMessage } from '../../api/errorMessage';
import type { StoryBibleApi } from '../../api/contracts/storyBible';
import type { Command, Journal, Result } from '../journal/createJournal';

/** The speaker a cue has when nobody is chosen, as the host spells it. */
export const UNKNOWN_SPEAKER = 'unknown';

/** A cue as the correction needs it: its id and who it is attributed to now (null when nobody is). */
export type CueToCorrect = { id: string; speaker_entity_id?: string | null };

export type CueApi = Pick<StoryBibleApi, 'guideCorrectCue'>;

/**
 * The one command that says who speaks a quoted line (audit cluster 12, docs/research/ui-function-audit.md): Script, the Story Bible's cue list and the Booth
 * all attribute a cue through it, so each is one journal entry ("Confirmed a speaker") that Undo reverses, and a correction reads the same everywhere.
 * Undo gives the line its earlier speaker back, or `unknown`.
 */
export function attributeCueCommand(storyBible: CueApi, cue: CueToCorrect, speakerEntityId: string): Command<null> {
  const correct = (speaker: string) => async (): Promise<Result<null>> => {
    try {
      await storyBible.guideCorrectCue(cue.id, speaker);
      return { ok: true, value: null };
    } catch (error) {
      return { ok: false, refusal: { code: 'host-refused', reason: apiErrorMessage(error) } };
    }
  };
  return {
    label: 'Confirmed a speaker',
    touches: [`storyBible/cues/${cue.id}`],
    run: correct(speakerEntityId),
    undo: correct(cue.speaker_entity_id ?? UNKNOWN_SPEAKER),
  };
}

/** Attributes the cue through the journal. */
export const attributeCue = (journal: Pick<Journal, 'act'>, storyBible: CueApi, cue: CueToCorrect, speakerEntityId: string) =>
  journal.act<null>(attributeCueCommand(storyBible, cue, speakerEntityId));
