// The browser mock's pronunciation sources. It answers from fixture data, offline, and keeps the host's rules
// (apps/desktop/bindings_pronunciationsources.go): a miss, `manual`, an unknown source and an empty or over-long word are
// `{ ok: false, reason }` results, never thrown errors. The mock reports every source available, the online one included.
import type { PronunciationCandidate, PronunciationSource, PronunciationSourceList, PronunciationSourcesApi } from './contracts/pronunciationSources';

/** The longest word a candidate is asked for (the host's and the sidecar's limit). */
const PRONUNCIATION_CANDIDATE_MAX_WORD = 80;

const SOURCES: PronunciationSource[] = [
  { id: 'cmu', label: 'CMU dictionary', kind: 'lookup', available: true },
  { id: 'wiktextract', label: 'Wiktionary (via Wiktextract)', kind: 'lookup', needs: 'localDictionary', available: true },
  { id: 'espeak', label: 'eSpeak NG', kind: 'generated', available: true },
  { id: 'merriam_webster', label: 'Merriam-Webster', kind: 'lookup', needs: 'network', available: true },
  { id: 'manual', label: 'Entered by me', kind: 'manual', available: true },
];

// What each source says for a lower-case word; a word a source has nothing for is absent.
const SAY: Record<string, Record<string, string>> = {
  cmu: { alice: 'AE1 L AH0 S', queen: 'K W IY1 N', croquet: 'K R OW0 K EY1', hatter: 'HH AE1 T ER0' },
  wiktextract: { alice: '/ˈælɪs/', queen: '/kwiːn/', croquet: '/ˈkɹoʊkeɪ/', caterpillar: '/ˈkætəpɪlə/' },
  espeak: { alice: 'ˈalɪs', queen: 'kwˈiːn', croquet: 'kɹˈɒkɪt', wren: 'ɹˈɛn', quorlen: 'kwˈɔːlən' },
  merriam_webster: { alice: 'ˈa-ləs', croquet: 'krō-ˈkā', wren: 'ˈren', hatter: 'ˈha-tər' },
};

export function createPronunciationSourcesMock(): PronunciationSourcesApi {
  return {
    pronunciationSources: async (): Promise<PronunciationSourceList> => ({ sources: SOURCES.map((source) => ({ ...source })), default: 'cmu' }),
    pronunciationCandidate: async (rawWord, sourceId): Promise<PronunciationCandidate> => {
      const word = rawWord.trim();
      if (sourceId === 'manual') return { ok: false, reason: 'Type it in.' };
      if (word === '') return { ok: false, reason: 'Type a word or name to look up.' };
      if ([...word].length > PRONUNCIATION_CANDIDATE_MAX_WORD) {
        return { ok: false, reason: `A word or name can be at most ${PRONUNCIATION_CANDIDATE_MAX_WORD} characters.` };
      }
      const source = SOURCES.find((row) => row.id === sourceId);
      if (!source) return { ok: false, reason: 'That source is not available.' };
      const say = SAY[source.id]?.[word.toLowerCase()];
      return say ? { ok: true, say } : { ok: false, reason: `${source.label} has nothing for “${word}”.` };
    },
  };
}
