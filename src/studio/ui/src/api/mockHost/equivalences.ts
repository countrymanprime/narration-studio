// The mock host (mockApi.ts): TranscriptAddEquivalence, as src/studio/desktop/internal/transcript/service.go answers it.
import type { Finding } from '../../types';

const NOT_ONE_WORD = 'Only a note where one word was read as one other word can be treated as the same word in later checks.';
const oneWord = (word: string | undefined): word is string => Boolean(word) && !/[ \t\r\n]/.test(word!);

/**
 * The add: `get` reads a note by its finding id, and a one-word Transcript Compare misread's two words become one group. A pair a group
 * already holds (either order, any case) is not added again; any other note, or an id that names none, is refused in the host's words.
 */
export function createEquivalenceMock(get: (id: string) => Promise<Finding>) {
  const groups: Set<string>[] = [];
  return {
    transcriptAddEquivalence: async (id: string): Promise<string> => {
      let finding: Finding;
      try {
        finding = await get(id);
      } catch {
        // The host refuses an id that names no note in the same words as any other note it cannot add.
        throw new Error(NOT_ONE_WORD);
      }
      const doc = finding.manuscript?.expected;
      const audio = finding.manuscript?.recorded;
      if (
        finding.analyzer !== 'transcript-compare' ||
        finding.category !== 'transcript_discrepancy' ||
        finding.evidence?.kind !== 'MISREAD' ||
        !oneWord(doc) ||
        !oneWord(audio)
      )
        throw new Error(NOT_ONE_WORD);
      const [a, b] = [doc.toLowerCase(), audio.toLowerCase()];
      if (groups.some((group) => group.has(a) && group.has(b))) return `Already treated as the same: ${doc} = ${audio}`;
      groups.push(new Set([a, b]));
      return `Added equivalence: ${doc} = ${audio}`;
    },
  };
}
