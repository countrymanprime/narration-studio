import { StatusBadge } from '../../primitives/StatusBadge';
import { keyName, lineCount, type WhoCharacter } from './whoIsIn';

/** The key of the voice that records a character or how many lines it speaks here: one badge for the dialog's rows and the voice list's. */
export function CharacterBadge({ character }: { character: WhoCharacter }) {
  if (character.key !== undefined) return <StatusBadge tone="neutral" label={character.key ? `on ${keyName(character.key)}` : 'on a track'} />;
  return character.lines > 0 ? <StatusBadge tone="neutral" label={lineCount(character.lines)} /> : null;
}
