import { StatusBadge } from '../../primitives/StatusBadge';
import { chordText, lineCount, voiceChord, type WhoCharacter } from './whoIsIn';

/** The key of the voice that records a character or how many lines it speaks here: one badge for the dialog's rows and the voice list's. */
export function CharacterBadge({ character }: { character: WhoCharacter }) {
  if (character.key !== undefined) {
    // `chord` is the voice's keys (Shift and a digit past nine); a character built from a key alone names that key.
    const keys = character.chord?.length ? character.chord : voiceChord({ key: character.key });
    return <StatusBadge tone="neutral" label={keys.length ? `on ${chordText(keys)}` : 'on a track, no key'} />;
  }
  return character.lines > 0 ? <StatusBadge tone="neutral" label={lineCount(character.lines)} /> : null;
}
