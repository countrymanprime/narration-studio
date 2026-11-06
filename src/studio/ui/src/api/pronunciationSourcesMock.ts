// The browser mock's pronunciation sources. It answers from fixture data, offline, and keeps the host's rules
// (src/studio/desktop/bindings_pronunciationsources.go): a miss, `manual`, an unknown source and an empty or over-long word are
// `{ ok: false, reason }` results, never thrown errors. The mock reports every source available, the online one included.
import {
  SCRIPT_IMPORTED_SOURCE,
  USER_DICTIONARY_SOURCE,
  type PronunciationCandidate,
  type PronunciationSource,
  type PronunciationSourceList,
  type PronunciationSourcesApi,
  type UserDictionaryRecord,
  type UserDictionaryWord,
} from './contracts/pronunciationSources';
import { MOCK_PREVIEW_WAV_BASE64 } from './mockHost/storyBible';

/** The longest word a candidate is asked for (the host's and the sidecar's limit). */
const PRONUNCIATION_CANDIDATE_MAX_WORD = 80;

const SOURCES: PronunciationSource[] = [
  { id: 'cmu', label: 'CMU dictionary', kind: 'lookup', available: true },
  { id: 'wiktextract', label: 'Wiktionary (via Wiktextract)', kind: 'lookup', needs: 'localDictionary', available: true },
  { id: 'espeak', label: 'eSpeak NG', kind: 'generated', available: true },
  { id: 'merriam_webster', label: 'Merriam-Webster', kind: 'lookup', needs: 'network', available: true },
  { id: USER_DICTIONARY_SOURCE, label: 'My dictionary', kind: 'lookup', available: true },
  { id: SCRIPT_IMPORTED_SOURCE, label: 'Script (imported)', kind: 'lookup', available: true },
  { id: 'manual', label: 'Entered by me', kind: 'manual', available: true },
];
const USER_LAYERS: readonly string[] = [USER_DICTIONARY_SOURCE, SCRIPT_IMPORTED_SOURCE];
const fold = (word: string) => word.trim().toLowerCase();

// What each source says for a lower-case word; a word a source has nothing for is absent.
const SAY: Record<string, Record<string, string>> = {
  cmu: { alice: 'AE1 L AH0 S', queen: 'K W IY1 N', croquet: 'K R OW0 K EY1', hatter: 'HH AE1 T ER0' },
  wiktextract: { alice: '/ˈælɪs/', queen: '/kwiːn/', croquet: '/ˈkɹoʊkeɪ/', caterpillar: '/ˈkætəpɪlə/' },
  espeak: { alice: 'ˈalɪs', queen: 'kwˈiːn', croquet: 'kɹˈɒkɪt', wren: 'ɹˈɛn', quorlen: 'kwˈɔːlən' },
  merriam_webster: { alice: 'ˈa-ləs', croquet: 'krō-ˈkā', wren: 'ˈren', hatter: 'ˈha-tər' },
};

export function createPronunciationSourcesMock(): PronunciationSourcesApi {
  // The user dictionary, kept in memory as the host keeps user-dictionary.json: a word's records by its folded spelling.
  const user = new Map<string, UserDictionaryWord>();
  const entryOf = (word: string): UserDictionaryWord => user.get(fold(word)) ?? { word: word.trim(), records: [] };
  const recordOf = (word: string, source: string): UserDictionaryRecord | undefined => entryOf(word).records.find((row) => row.source === source);
  const candidate = async (rawWord: string, sourceId: string): Promise<PronunciationCandidate> => {
    const word = rawWord.trim();
    if (sourceId === 'manual') return { ok: false, reason: 'Type it in.' };
    if (word === '') return { ok: false, reason: 'Type a word or name to look up.' };
    if ([...word].length > PRONUNCIATION_CANDIDATE_MAX_WORD) {
      return { ok: false, reason: `A word or name can be at most ${PRONUNCIATION_CANDIDATE_MAX_WORD} characters.` };
    }
    const source = SOURCES.find((row) => row.id === sourceId);
    if (!source) return { ok: false, reason: 'That source is not available.' };
    if (USER_LAYERS.includes(source.id)) {
      const record = recordOf(word, source.id);
      return record ? { ok: true, say: record.say } : { ok: false, reason: `${source.label} has nothing for “${word}”.` };
    }
    const say = SAY[source.id]?.[word.toLowerCase()];
    return say ? { ok: true, say } : { ok: false, reason: `${source.label} has nothing for “${word}”.` };
  };
  return {
    pronunciationSources: async (): Promise<PronunciationSourceList> => ({ sources: SOURCES.map((source) => ({ ...source })), default: 'cmu' }),
    pronunciationCandidate: candidate,
    pronunciationCandidates: async (word) => {
      const result: Awaited<ReturnType<PronunciationSourcesApi['pronunciationCandidates']>> = { candidates: [], misses: [] };
      for (const source of SOURCES) {
        if (source.kind === 'manual' || source.needs === 'network' || !source.available || USER_LAYERS.includes(source.id)) continue;
        const answer = await candidate(word, source.id);
        if (answer.ok) result.candidates.push({ sourceId: source.id, label: source.label, say: answer.say });
        else result.misses.push({ sourceId: source.id, label: source.label, reason: answer.reason });
      }
      for (const record of entryOf(word).records) {
        const label = SOURCES.find((row) => row.id === record.source)?.label ?? record.source;
        result.candidates.push({ sourceId: record.source, label, say: record.say });
      }
      return result;
    },
    pronunciationPreview: async (text, ipa) => {
      if (!text.trim() || !ipa.trim()) throw new Error('There is nothing to say.');
      return { status: 'ready', audioBase64: MOCK_PREVIEW_WAV_BASE64, mimeType: 'audio/wav' };
    },
    userDictionarySave: async (rawWord, rawSay) => {
      const word = rawWord.trim();
      const say = rawSay.trim();
      if (!word) throw new Error('Type a word first.');
      if (!say) throw new Error('Type how it is said first.');
      if (/[\n\r]/.test(say)) throw new Error('How a word is said is one line of text.');
      const entry = entryOf(word);
      const records = [
        ...entry.records.filter((row) => row.source !== USER_DICTIONARY_SOURCE),
        { say, source: USER_DICTIONARY_SOURCE, addedAt: '2026-11-03T00:00:00Z' },
      ];
      const next = { word: entry.word || word, records };
      user.set(fold(word), next);
      return { word: next.word, records: next.records.map((r) => ({ ...r })) };
    },
    userDictionaryRemove: async (rawWord, source, say) => {
      const entry = entryOf(rawWord);
      const records = entry.records.filter((row) => !(row.source === source && row.say === say));
      if (records.length) user.set(fold(rawWord), { word: entry.word, records });
      else user.delete(fold(rawWord));
      return { word: entry.word, records: records.map((r) => ({ ...r })) };
    },
  };
}
