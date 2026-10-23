// The browser mock's voice samples. It keeps them in memory and applies the rules apps/desktop/internal/voicesample does that need no
// audio: a request the host would call invalid throws, a stretch it would refuse comes back as a refused answer with the host's
// sentence and nothing is saved, the first sample of a character is its primary, a delete promotes the newest remaining, and each
// sample's source state is read against the mock manuscript on every list. It has no audio to cut, so a clip is a length and a size
// worked out as the host would write it (8 kHz, 16-bit mono), and a clip is always `ok`.
import {
  VOICE_SAMPLE_LABEL_MAX,
  VOICE_SAMPLE_NOTE_MAX,
  VOICE_SAMPLE_SENTENCES,
  type ManuscriptChapter,
  type ManuscriptParagraph,
  type VoiceSample,
  type VoiceSampleAnswer,
  type VoiceSampleClipState,
  type VoiceSampleRefusalReason,
  type VoiceSamples,
  type VoiceSampleSourceState,
  type VoiceSamplesApi,
  type VoiceSamplesChanged,
} from '../types';
import type { MergeEvents } from './mockHost/mergeEvents';
import { mockAudioSource } from './mockHost/system';
import { wireClone } from './mockFixtures';

const MIN_SECONDS = 0.5;
const MAX_SECONDS = 30;
const HANDLE_SECONDS = 0.15;
const PER_CHARACTER = 20;
const PROJECT_BYTES = 200 * 1024 * 1024;
const MAX_CHARACTER_ID = 128;
const MAX_SPAN_WORDS = 1000;
const MOCK_RATE = 8000;
const MOCK_FRAME_BYTES = 2;
const WAV_HEADER_BYTES = 44;

/** A stored sample: what a list sends, less the two states read on every list, plus the item and the start the host keeps and never sends. */
type Stored = Omit<VoiceSample, 'clipState' | 'source'> & {
  source: Omit<VoiceSample['source'], 'chapterTitle' | 'state'>;
  itemGuid: string;
  start: number;
  /** A seeded clip the host would find damaged; a sample marked in the mock is always `ok`. */
  clip?: VoiceSampleClipState;
  /** Set while the sample sits where a Story Bible merge put it, as the host keeps it on the row; never sent. */
  merge?: { undoId: string; from: string; to: string; wasPrimary: boolean };
};

/**
 * Samples a page can boot with (`?mockVoiceSamples=`), for the Story Bible's states: `bible` is a Queen of Hearts with a primary, a
 * playing-length one, a sample whose passage changed and one whose audio file is missing, the Hatter with one, Narration with one and a
 * sample for a character who is no longer in the Story Bible; `full` is a Queen with the 20 a character may have.
 */
export type VoiceSamplesSeed = 'bible' | 'full';

type SeedRow = {
  characterId: string;
  label: string;
  note: string;
  primary: boolean;
  seconds: number;
  chapter: number;
  from: number;
  to: number;
  changed?: true;
  clip?: VoiceSampleClipState;
};

const SEED_ROWS: Record<VoiceSamplesSeed, SeedRow[]> = {
  bible: [
    {
      characterId: 'queen-of-hearts',
      label: 'Furious, to the court',
      note: 'Pitch up, clipped, no breaths.',
      primary: true,
      seconds: 7.4,
      chapter: 1,
      from: 0,
      to: 5,
    },
    { characterId: 'queen-of-hearts', label: 'Sulking', note: '', primary: false, seconds: 12, chapter: 2, from: 1, to: 6 },
    { characterId: 'queen-of-hearts', label: 'Whispering', note: '', primary: false, seconds: 5, chapter: 3, from: 0, to: 3, changed: true },
    { characterId: 'queen-of-hearts', label: 'Laughing', note: '', primary: false, seconds: 3.2, chapter: 1, from: 2, to: 4, clip: 'missing' },
    { characterId: 'mad-hatter', label: 'Tea party, quick', note: 'Runs the words together.', primary: true, seconds: 6.1, chapter: 2, from: 0, to: 4 },
    { characterId: 'narration', label: 'Narration, calm', note: '', primary: true, seconds: 9, chapter: 1, from: 0, to: 6 },
    { characterId: 'bill-the-lizard', label: 'Growling', note: '', primary: true, seconds: 4, chapter: 4, from: 0, to: 2 },
  ],
  full: Array.from({ length: 20 }, (_, index) => ({
    characterId: 'queen-of-hearts',
    label: `Take ${index + 1}`,
    note: '',
    primary: index === 0,
    seconds: 4 + (index % 5),
    chapter: 1 + (index % 3),
    from: 0,
    to: 2 + (index % 4),
  })),
};

/** UTF-16 units, as the host counts them: a JS string's length. */
// eslint-disable-next-line no-control-regex -- the point is to find control characters
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;

const wordsOf = (text: string): string[] => text.split(/\s+/).filter(Boolean);

function checkText(text: string, name: string, limit: number, multiline: boolean) {
  if (text.length > limit) throw new Error(`a sample's ${name} can be at most ${limit} characters`);
  const checked = multiline ? text.replace(/[\n\t]/g, '') : text;
  if (controlCharacters.test(checked)) {
    throw new Error(multiline ? `a sample's ${name} can hold only text, line breaks and tabs` : `a sample's ${name} is one line of text`);
  }
}

function cleanText(label: string, note: string): { label: string; note: string } {
  const cleanLabel = label.trim();
  const cleanNote = note.replaceAll('\r\n', '\n').trim();
  checkText(cleanLabel, 'label', VOICE_SAMPLE_LABEL_MAX, false);
  checkText(cleanNote, 'note', VOICE_SAMPLE_NOTE_MAX, true);
  return { label: cleanLabel, note: cleanNote };
}

function cleanCharacter(id: string): string {
  const clean = id.trim();
  if (clean === '') throw new Error('choose a character');
  if ([...clean].length > MAX_CHARACTER_ID || controlCharacters.test(clean)) throw new Error('that is not a character');
  return clean;
}

const parseKey = (key: string): { paragraphId: string; ordinal: number } => {
  const cut = key.lastIndexOf(':');
  const digits = key.slice(cut + 1);
  if (cut <= 0 || !/^(0|[1-9]\d*)$/.test(digits)) throw new Error('that is not a word of the script');
  return { paragraphId: key.slice(0, cut), ordinal: Number(digits) };
};

export function createVoiceSamplesMock(
  ready: Promise<unknown>,
  chapters: () => ManuscriptChapter[],
  paragraphs: () => ManuscriptParagraph[],
  seed?: VoiceSamplesSeed,
  merges?: MergeEvents,
): VoiceSamplesApi {
  let stored: Stored[] = [];
  let nextId = seed ? SEED_ROWS[seed].length + 1 : 1;
  let revision = 0;
  let clock = Date.UTC(2026, 9, 18, 9, 30, 0);
  const subscribers = new Set<(event: VoiceSamplesChanged) => void>();
  let seeded = seed === undefined;
  const settle = async () => {
    await ready;
    if (!seeded) {
      seeded = true;
      stored = seedRows();
    }
  };

  const changed = () => {
    revision += 1;
    for (const subscriber of subscribers) subscriber({ revision });
  };

  /** The words from one key to the other in a chapter's current text, joined by a space, or why there are none. */
  const spanText = (chapterId: string, startKey: string, endKey: string): { text: string } | { problem: 'chapter' | 'moved' | 'long' } => {
    const start = parseKey(startKey);
    const end = parseKey(endKey);
    if (!chapters().some((chapter) => chapter.id === chapterId)) return { problem: 'chapter' };
    const lines = paragraphs().filter((paragraph) => paragraph.chapterId === chapterId);
    const first = lines.findIndex((line) => line.id === start.paragraphId);
    const last = lines.findIndex((line) => line.id === end.paragraphId);
    if (first < 0 || last < 0) return { problem: 'moved' };
    if (last < first || (last === first && end.ordinal < start.ordinal)) throw new Error('a span ends after it starts');
    const picked: string[] = [];
    for (let index = first; index <= last; index += 1) {
      const words = wordsOf(lines[index]?.text ?? '');
      const from = index === first ? start.ordinal : 0;
      const to = index === last ? end.ordinal + 1 : words.length;
      if ((index === last && end.ordinal >= words.length) || from > words.length || from > to) return { problem: 'moved' };
      picked.push(...words.slice(from, to));
      if (picked.length > MAX_SPAN_WORDS) return { problem: 'long' };
    }
    return { text: picked.join(' ') };
  };

  /** The seeded rows, written against the mock manuscript as they would have been when marked. */
  const seedRows = (): Stored[] => {
    if (!seed) return [];
    return SEED_ROWS[seed].map((row, index) => {
      const lines = paragraphs().filter((paragraph) => paragraph.chapterId === `chapter-${row.chapter}`);
      const line = lines[0];
      const startKey = `${line?.id ?? 'p-1'}:${row.from}`;
      const endKey = `${line?.id ?? 'p-1'}:${row.to}`;
      const span = spanText(`chapter-${row.chapter}`, startKey, endKey);
      const frames = Math.round(row.seconds * MOCK_RATE);
      return {
        id: (index + 1).toString(16).padStart(32, '0'),
        characterId: row.characterId,
        label: row.label,
        note: row.note,
        primary: row.primary,
        createdAt: new Date(clock + index * 1000).toISOString(),
        durationMs: Math.round(row.seconds * 1000),
        bytes: WAV_HEADER_BYTES + frames * MOCK_FRAME_BYTES,
        source: {
          chapterId: `chapter-${row.chapter}`,
          text: row.changed ? 'words that read differently before the edit' : 'text' in span ? span.text : '',
          startKey,
          endKey,
        },
        itemGuid: `{5EED0000-0000-0000-0000-${String(index + 1).padStart(12, '0')}}`,
        start: 0,
        ...(row.clip ? { clip: row.clip } : {}),
      };
    });
  };
  const view = (sample: Stored): VoiceSample => {
    const chapter = chapters().find((candidate) => candidate.id === sample.source.chapterId);
    let state: VoiceSampleSourceState = 'chapter_missing';
    if (chapter) {
      const span = spanText(sample.source.chapterId, sample.source.startKey, sample.source.endKey);
      state = 'text' in span && span.text === sample.source.text ? 'ok' : 'text_changed';
    }
    const { id, characterId, label, note, primary, createdAt, durationMs, bytes } = sample;
    return {
      id,
      characterId,
      label,
      note,
      primary,
      createdAt,
      durationMs,
      bytes,
      clipState: sample.clip ?? 'ok',
      source: { ...sample.source, chapterTitle: chapter?.title ?? '', state },
    };
  };

  const list = (): VoiceSamples => {
    const order = stored.map((sample, index) => ({ sample, index }));
    order.sort(
      (a, b) =>
        (a.sample.characterId < b.sample.characterId ? -1 : a.sample.characterId > b.sample.characterId ? 1 : 0) ||
        Number(b.sample.primary) - Number(a.sample.primary) ||
        b.sample.createdAt.localeCompare(a.sample.createdAt) ||
        b.index - a.index,
    );
    return wireClone({
      samples: order.map(({ sample }) => view(sample)),
      totals: { count: stored.length, bytes: stored.reduce((total, sample) => total + sample.bytes, 0) },
      limits: {
        minSeconds: MIN_SECONDS,
        maxSeconds: MAX_SECONDS,
        perCharacter: PER_CHARACTER,
        projectBytes: PROJECT_BYTES,
        labelUnits: VOICE_SAMPLE_LABEL_MAX,
        noteUnits: VOICE_SAMPLE_NOTE_MAX,
      },
    });
  };

  const refused = (reason: VoiceSampleRefusalReason): VoiceSampleAnswer => ({ status: 'refused', reason, message: VOICE_SAMPLE_SENTENCES[reason] });

  const promoteNewest = (characterId: string) => {
    const mine = stored.filter((sample) => sample.characterId === characterId);
    if (mine.length === 0 || mine.some((sample) => sample.primary)) return;
    const newest = mine.reduce((best, sample) => (sample.createdAt >= best.createdAt ? sample : best));
    stored = stored.map((sample) => (sample.id === newest.id ? { ...sample, primary: true } : sample));
  };

  /**
   * The Story Bible merged `from` into `to`: as the host's FollowMerge, every sample of `from` moves, the absorbed primary first and
   * then the newest, up to the 20 a character may have. The survivor keeps its own primary. Each moved sample remembers the merge.
   */
  const followMerge = (undoId: string, from: string, to: string) => {
    const mine = stored
      .filter((sample) => sample.characterId === from)
      .sort((a, b) => Number(b.primary) - Number(a.primary) || b.createdAt.localeCompare(a.createdAt));
    if (mine.length === 0) return;
    let room = Math.max(0, PER_CHARACTER - stored.filter((sample) => sample.characterId === to).length);
    let hasPrimary = stored.some((sample) => sample.characterId === to && sample.primary);
    const moved = new Map<string, Stored>();
    for (const sample of mine) {
      if (room === 0) break;
      room -= 1;
      const primary = sample.primary && !hasPrimary;
      hasPrimary = hasPrimary || primary;
      moved.set(sample.id, { ...sample, characterId: to, primary, merge: { undoId, from, to, wasPrimary: sample.primary } });
    }
    if (moved.size === 0) return;
    stored = stored.map((sample) => moved.get(sample.id) ?? sample);
    promoteNewest(from);
    changed();
  };

  /** The Story Bible took the merge back: as the host's UndoFollow, each sample still where the merge put it goes home. */
  const undoFollow = (undoId: string) => {
    const touched = new Set<string>();
    let moved = 0;
    const next: Stored[] = [];
    for (const sample of stored) {
      const merge = sample.merge;
      if (!merge || merge.undoId !== undoId || sample.characterId !== merge.to) {
        next.push(sample);
        continue;
      }
      touched.add(merge.to);
      touched.add(merge.from);
      const homeHasPrimary = next.concat(stored).some((other) => other !== sample && other.characterId === merge.from && other.primary);
      next.push({ ...sample, merge: undefined, characterId: merge.from, primary: merge.wasPrimary && !homeHasPrimary });
      moved += 1;
    }
    if (moved === 0) return;
    stored = next;
    touched.forEach(promoteNewest);
    changed();
  };
  merges?.onMerged((undoId, from, to) => void settle().then(() => followMerge(undoId, from, to)));
  merges?.onUnmerged((undoId) => void settle().then(() => undoFollow(undoId)));

  return {
    voiceSamplesList: async () => {
      await settle();
      return list();
    },
    voiceSampleMark: async (request) => {
      await settle();
      for (const [name, value] of [
        ['chapter', request.chapterId],
        ['item', request.itemGuid],
        ['take', request.takeGuid],
      ] as const) {
        if (value.trim() === '') throw new Error(`a sample needs its ${name}`);
      }
      const characterId = cleanCharacter(request.characterId);
      const { label, note } = cleanText(request.label, request.note);
      if (!Number.isFinite(request.sourceStart) || !Number.isFinite(request.sourceEnd) || request.sourceStart < 0 || request.sourceEnd <= request.sourceStart) {
        throw new Error("a sample's range is seconds into the recording, ending after it starts");
      }
      const span = spanText(request.chapterId, request.startKey, request.endKey);
      if ('problem' in span) return refused(span.problem === 'long' ? 'too_long' : 'stale_alignment');
      if (request.alignmentRecordId === '') return refused('stale_alignment');
      // The host adds a 150 ms handle each side (clamped to the played range, which the mock does not know) and refuses a clip outside 0.5 to 30 s.
      const seconds = request.sourceEnd - request.sourceStart + 2 * HANDLE_SECONDS;
      if (seconds > MAX_SECONDS + 1e-9) return refused('too_long');
      if (seconds < MIN_SECONDS - 1e-9) return refused('too_short');
      const frames = Math.round(seconds * MOCK_RATE);
      const bytes = WAV_HEADER_BYTES + frames * MOCK_FRAME_BYTES;
      const durationMs = Math.round((frames * 1000) / MOCK_RATE);
      const start = Math.max(0, request.sourceStart - HANDLE_SECONDS);
      const existing = stored.find(
        (sample) =>
          sample.characterId === characterId &&
          sample.source.startKey === request.startKey &&
          sample.source.endKey === request.endKey &&
          sample.itemGuid === request.itemGuid &&
          sample.start === start &&
          sample.durationMs === durationMs,
      );
      if (existing) return { status: 'saved', sample: wireClone(view(existing)) };
      if (stored.filter((sample) => sample.characterId === characterId).length >= PER_CHARACTER) return refused('character_limit');
      if (stored.reduce((total, sample) => total + sample.bytes, 0) + bytes > PROJECT_BYTES) return refused('project_limit');
      const primary = request.makePrimary || !stored.some((sample) => sample.characterId === characterId);
      clock += 1000;
      const sample: Stored = {
        id: (nextId++).toString(16).padStart(32, '0'),
        characterId,
        label,
        note,
        primary,
        createdAt: new Date(clock).toISOString(),
        durationMs,
        bytes,
        source: { chapterId: request.chapterId, text: span.text, startKey: request.startKey, endKey: request.endKey },
        itemGuid: request.itemGuid,
        start,
      };
      stored = [...stored.map((other) => (primary && other.characterId === characterId ? { ...other, primary: false } : other)), sample];
      changed();
      return { status: 'saved', sample: wireClone(view(sample)) };
    },
    voiceSampleUpdate: async (id, change) => {
      await settle();
      const { label, note } = cleanText(change.label, change.note);
      const characterId = cleanCharacter(change.characterId);
      const current = stored.find((sample) => sample.id === id);
      if (!current) return refused('not_found');
      let updated: Stored = { ...current, label, note };
      if (characterId !== current.characterId) {
        if (stored.filter((sample) => sample.characterId === characterId).length >= PER_CHARACTER) return refused('character_limit');
        updated = { ...updated, characterId, merge: undefined, primary: !stored.some((sample) => sample.characterId === characterId) };
      }
      if (JSON.stringify(updated) !== JSON.stringify(current)) {
        stored = stored.map((sample) => (sample.id === id ? updated : sample));
        if (current.primary && updated.characterId !== current.characterId) promoteNewest(current.characterId);
        changed();
      }
      const now = stored.find((sample) => sample.id === id) ?? updated;
      return { status: 'saved', sample: wireClone(view(now)) };
    },
    voiceSampleSetPrimary: async (id) => {
      await settle();
      const target = stored.find((sample) => sample.id === id);
      if (!target) throw new Error('that voice sample is no longer there');
      const next = stored.map((sample) => (sample.characterId === target.characterId ? { ...sample, primary: sample.id === id } : sample));
      if (JSON.stringify(next) !== JSON.stringify(stored)) {
        stored = next;
        changed();
      }
      return list();
    },
    voiceSampleRemove: async (id) => {
      await settle();
      const gone = stored.find((sample) => sample.id === id);
      if (!gone) return { removed: 0, bytes: 0 };
      stored = stored.filter((sample) => sample.id !== id);
      if (gone.primary) promoteNewest(gone.characterId);
      changed();
      return { removed: 1, bytes: gone.bytes };
    },
    voiceSamplesRemoveAll: async () => {
      await settle();
      const removed = { removed: stored.length, bytes: stored.reduce((total, sample) => total + sample.bytes, 0) };
      stored = [];
      if (removed.removed > 0) changed();
      return removed;
    },
    // Browser mock mode has no /media route: where object URLs exist a silent WAV stands in for every clip, as it does for a track; elsewhere (jsdom)
    // the URL is the host's own shape, so a test sees what the page would ask for.
    voiceSampleMediaUrl: (id) => mockAudioSource() ?? `/media?sample=${encodeURIComponent(id)}`,
    subscribeVoiceSamples: (onChange) => {
      subscribers.add(onChange);
      return () => subscribers.delete(onChange);
    },
  };
}
