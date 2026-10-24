// The one rule every page (Script, Booth, Editing) draws a quoted line's speaker chip by: who it can name, and whether it is solid
// (confirmed) or dashed (suggested). Pure; types only.
import type { GuideDialogueCue, GuideEntity, GuideType } from '../../types';

/** How a quoted line's speaker chip is drawn: `confirmed` (solid) once the narrator confirmed or picked the speaker, `suggested`
 * (dashed) for any speaker found automatically, `unknown` ("?") for nobody. */
export type CueSpeakerState = 'confirmed' | 'suggested' | 'unknown';

/** Whether the narrator chose this line's speaker: a correction. Every other speaker is a suggestion. */
export const cueIsConfirmed = (cue: Pick<GuideDialogueCue, 'corrected' | 'speaker_source'>): boolean => cue.corrected || cue.speaker_source === 'correction';

/** The chip state of a line whose speaker is `speaker` (null for nobody the page can name). */
export const cueSpeakerState = (cue: Pick<GuideDialogueCue, 'corrected' | 'speaker_source'>, speaker: unknown): CueSpeakerState =>
  !speaker ? 'unknown' : cueIsConfirmed(cue) ? 'confirmed' : 'suggested';

/** The entries a line's chip can name: those whose type speaks (`canSpeak`), and Needs Review names, which the rules suggest from a
 * speech tag or a name near the line. A line given to any other entry has no speaker. */
export function cueSpeakerEntries<E extends Pick<GuideEntity, 'category'>>(entries: readonly E[], types: readonly GuideType[]): E[] {
  const speaking = new Set(types.filter((type) => type.speaks).map((type) => type.name));
  return entries.filter((entry) => entry.category === 'Needs Review' || speaking.has(entry.category));
}
