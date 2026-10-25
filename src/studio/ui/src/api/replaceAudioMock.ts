// The browser mock of Replace audio (src/studio/desktop/bindings_replace.go and internal/editlog's narrators.go and replacements.go).
// It keeps the project's other narrators, their files and the chapter's replacements in memory, resolves the words from the mock's
// own alignment the way passagetakes.ResolveRange does, and answers with the host's sentences. The file dialog is not shown: adding a
// file picks the demo's other reading of Chapter I (Eric Leach's LibriVox read, tests/fixtures/audio/librivox-alice), and its stretch
// measures -23.4 LUFS.
import type {
  DawResult,
  Narrator,
  NarratorFile,
  Narrators,
  NarratorsChange,
  ReplaceAnswer,
  ReplaceAudioApi,
  ReplaceFileAnswer,
  ReplaceFilePeaks,
  ReplacePlan,
  Replacement,
  Replacements,
  ReplacementsChange,
  WorkspaceAlignmentResult,
} from '../types';
import { REPLACE_MAX_GAIN_DB, REPLACE_MAX_SECONDS, REPLACE_MIN_SECONDS } from './contracts/replace';
import { wireClone } from './mockFixtures';

/** As the host allows (internal/editlog/narrators.go). */
const MAX_NARRATORS = 50;
const MAX_NAME = 80;
/** The demo file a mock "add a file" picks: Eric Leach's Chapter I, 796.5 s. */
const DEMO_FILE = { name: 'Eric Leach - Chapter 1.mp3', size: 6_372_352, length: 796.5 };
const DEMO_LUFS = -23.4;
const DEFAULT_TARGET_LUFS = -20;

const ok = (message: string, changed: boolean, undoSteps = changed ? 1 : 0): DawResult => ({ ok: true, changed, message, undoSteps });
const refused = (message: string, code?: 'stale'): DawResult => ({
  ok: false,
  changed: false,
  message,
  undoSteps: 0,
  refused: message,
  ...(code ? { code } : {}),
});

const validName = (name: string) => name.trim() !== '' && [...name].length <= MAX_NAME && !/[|\p{Cc}]/u.test(name);

export type ReplaceAudioMockDeps = {
  ready: Promise<unknown>;
  alignment: (chapterId: string) => Promise<WorkspaceAlignmentResult>;
  /** The paragraphs' texts, for the words a replacement names. */
  paragraphText: (chapterId: string, paragraphId: string) => string | undefined;
  /** Whether the DAW can make the edit now: false answers the capability's sentence. */
  available?: () => DawResult | null;
  /** Editing.replace_target_lufs. */
  targetLufs?: () => number;
  now?: () => string;
};

type StoredReplacement = Omit<Replacement, 'paragraph' | 'stale' | 'staleReason' | 'active'> & { paragraphs: string[]; ordinals: number[] };

export function createReplaceAudioMock(deps: ReplaceAudioMockDeps): ReplaceAudioApi {
  let narrators: Narrator[] = [];
  let replacements: StoredReplacement[] = [];
  let serial = 0;
  const now = deps.now ?? (() => new Date().toISOString());
  const target = () => deps.targetLufs?.() ?? DEFAULT_TARGET_LUFS;
  const list = (): Narrators => ({ narrators: wireClone(narrators) });
  const nextId = (prefix: string, used: string[]) => {
    for (let n = 1; ; n++) if (!used.includes(`${prefix}-${n}`)) return `${prefix}-${n}`;
  };
  const fileOf = (fileId: string) => {
    for (const narrator of narrators) {
      const file = narrator.files.find((candidate) => candidate.id === fileId);
      if (file) return { narrator, file };
    }
    return undefined;
  };

  const resolveReplacement = ({ paragraphs, ordinals, ...stored }: StoredReplacement): Replacement => {
    let stale = false;
    let staleReason: Replacement['staleReason'];
    let paragraph: number | null = null;
    paragraphs.forEach((paragraphId, index) => {
      const text = deps.paragraphText(stored.chapterId, paragraphId);
      if (text === undefined) {
        stale = true;
        staleReason = 'paragraph_missing';
        return;
      }
      if (index === 0) paragraph = Number(paragraphId.replace(/\D/g, '')) || 0;
      const words = text.split(/\s+/).filter(Boolean);
      if ((ordinals[index] ?? 0) >= words.length) {
        stale = true;
        staleReason = 'word_missing';
      } else if (words[ordinals[index] ?? 0] !== stored.words[index] && !stale) {
        stale = true;
        staleReason = 'text_changed';
      }
    });
    return { ...wireClone(stored), paragraph, stale, ...(staleReason ? { staleReason } : {}), active: stored.restoredAt === null };
  };
  const chapterList = (chapterId: string): Replacements => ({
    chapterId,
    replacements: replacements.filter((stored) => stored.chapterId === chapterId).map(resolveReplacement),
  });

  /** The words firstToken..lastToken as passagetakes.ResolveRange resolves them, or the host's refusal. */
  const resolveWords = async (chapterId: string, first: number, last: number) => {
    const alignment = await deps.alignment(chapterId);
    const tokens = alignment.tokens.slice(first, last + 1);
    if (first < 0 || last < first || last >= alignment.tokens.length)
      return refused(
        "That selection is not in this chapter's alignment any more, so nothing was changed. Reload the chapter and select the words again.",
        'stale',
      );
    if (tokens.some((token) => token.item === undefined))
      return refused("These words weren't heard in the recording, so there's no audio to cut. Run the check again if the chapter has changed.");
    if (new Set(tokens.map((token) => token.item)).size > 1) return refused('These words cross two REAPER items. Select words from one item at a time.');
    const item = alignment.items.find((candidate) => candidate.index === tokens[0]?.item);
    const head = tokens[0];
    const tail = tokens[tokens.length - 1];
    if (!item || !item.live || head?.start === undefined || tail?.end === undefined)
      return refused(
        "These words' item is no longer in the REAPER project as it was checked, so nothing was changed. Run the check again to find it where it is now.",
        'stale',
      );
    const rate = item.playRate && item.playRate > 0 ? item.playRate : 1;
    const at = (source: number) => (item.position ?? 0) + (source - (item.sourceStart ?? 0)) / rate;
    return {
      start: at(head.start),
      end: at(tail.end),
      words: tokens.map((token) => ({ paragraphId: token.p ?? '', ordinal: token.w, text: token.text })),
    };
  };

  const plan = async (chapterId: string, first: number, last: number, fileId: string, sourceStart: number, sourceEnd: number): Promise<ReplacePlan> => {
    await deps.ready;
    const empty: ReplacePlan = {
      result: ok('', false),
      narrator: '',
      words: 0,
      start: 0,
      end: 0,
      sourceStart: 0,
      sourceEnd: 0,
      shift: 0,
      measuredLufs: null,
      targetLufs: target(),
      gainDb: 0,
      clamped: false,
      loudnessNote: '',
    };
    const off = deps.available?.();
    if (off) return { ...empty, result: off };
    const found = fileOf(fileId);
    if (!found) return { ...empty, result: refused('That file of theirs is not in this project. Add it first.') };
    if (found.file.state === 'missing')
      return {
        ...empty,
        result: refused(`Their file ${found.file.name} is no longer where it was. Put it back, or add it again from where it is now.`, 'stale'),
      };
    const length = sourceEnd - sourceStart;
    if (
      !Number.isFinite(sourceStart) ||
      !Number.isFinite(sourceEnd) ||
      sourceStart < 0 ||
      sourceEnd > found.file.length ||
      length < REPLACE_MIN_SECONDS ||
      length > REPLACE_MAX_SECONDS
    )
      return { ...empty, result: refused('Choose a stretch of their audio inside their file, from 0.05 to 300 seconds long.') };
    const words = await resolveWords(chapterId, first, last);
    if ('ok' in words) return { ...empty, result: words };
    if (words.end - words.start > REPLACE_MAX_SECONDS) return { ...empty, result: refused('Choose words that last at most 300 seconds.') };
    const keys = new Set(words.words.map((word) => `${word.paragraphId}:${word.ordinal}`));
    const taken = replacements.some(
      (stored) => stored.chapterId === chapterId && stored.restoredAt === null && stored.paragraphs.some((pid, i) => keys.has(`${pid}:${stored.ordinals[i]}`)),
    );
    if (taken) return { ...empty, result: refused('Some of these words are already replaced. Put your audio back first.') };
    const gain = Math.round((target() - DEMO_LUFS) * 10) / 10;
    const clamped = Math.abs(gain) > REPLACE_MAX_GAIN_DB;
    return {
      ...empty,
      narrator: found.narrator.name,
      words: words.words.length,
      start: words.start,
      end: words.end,
      sourceStart,
      sourceEnd,
      shift: length - (words.end - words.start),
      measuredLufs: DEMO_LUFS,
      gainDb: clamped ? Math.sign(gain) * REPLACE_MAX_GAIN_DB : gain,
      clamped,
    };
  };

  const answer = (chapterId: string, result: DawResult, replacementId = ''): ReplaceAnswer => ({ result, replacementId, replacements: chapterList(chapterId) });

  return {
    replaceNarrators: async () => {
      await deps.ready;
      return list();
    },
    replaceNarratorAdd: async (rawName): Promise<NarratorsChange> => {
      await deps.ready;
      const name = rawName.trim();
      if (!validName(name)) throw new Error(`a name is 1 to ${MAX_NAME} characters, with no bar or control character`);
      if (narrators.some((narrator) => narrator.name.toLowerCase() === name.toLowerCase())) return { ...list(), changed: [] };
      if (narrators.length >= MAX_NARRATORS) throw new Error(`a project names at most ${MAX_NARRATORS} other narrators`);
      const id = nextId(
        'n',
        narrators.map((narrator) => narrator.id),
      );
      narrators = [...narrators, { id, name, addedAt: now(), files: [] }];
      return { ...list(), changed: [id] };
    },
    replaceNarratorRemove: async (id): Promise<NarratorsChange> => {
      await deps.ready;
      const narrator = narrators.find((candidate) => candidate.id === id);
      if (!narrator) return { ...list(), changed: [] };
      if (narrator.files.length) throw new Error(`${narrator.name}'s audio is in the project, so they stay on the list`);
      narrators = narrators.filter((candidate) => candidate.id !== id);
      return { ...list(), changed: [id] };
    },
    replaceAddFile: async (narratorId): Promise<ReplaceFileAnswer> => {
      await deps.ready;
      const off = deps.available?.();
      if (off) return { result: off, fileId: '', narrators: list() };
      const narrator = narrators.find((candidate) => candidate.id === narratorId);
      if (!narrator) return { result: refused("That narrator is not on this project's list. Add them first."), fileId: '', narrators: list() };
      const owner = narrators.find((candidate) => candidate.files.some((file) => file.name === DEMO_FILE.name));
      if (owner) return { result: refused(`${DEMO_FILE.name} is already in the project as ${owner.name}'s audio.`), fileId: '', narrators: list() };
      const id = nextId(
        'f',
        narrators.flatMap((candidate) => candidate.files.map((file) => file.id)),
      );
      const file: NarratorFile = { id, ...DEMO_FILE, daw: 'REAPER', addedAt: now(), state: 'ok' };
      narrators = narrators.map((candidate) => (candidate.id === narratorId ? { ...candidate, files: [...candidate.files, file] } : candidate));
      return { result: ok(`Added ${narrator.name}'s audio to REAPER on a muted track of its own.`, true), fileId: id, narrators: list() };
    },
    replacePlan: plan,
    dawReplaceRange: async (chapterId, first, last, fileId, sourceStart, sourceEnd, fadeMs, gainDb) => {
      if (!Number.isInteger(fadeMs) || fadeMs < 0 || fadeMs > 500)
        return answer(chapterId, refused('The fade must be a whole number of milliseconds from 0 to 500.'));
      if (!Number.isFinite(gainDb) || Math.abs(gainDb) > REPLACE_MAX_GAIN_DB) return answer(chapterId, refused('The level change must be from -24 to 24 dB.'));
      const planned = await plan(chapterId, first, last, fileId, sourceStart, sourceEnd);
      if (!planned.result.ok) return answer(chapterId, planned.result);
      const words = await resolveWords(chapterId, first, last);
      if ('ok' in words) return answer(chapterId, words);
      const found = fileOf(fileId);
      serial += 1;
      const id = `r-mock${String(serial).padStart(8, '0')}`;
      replacements = [
        ...replacements,
        {
          id,
          chapterId,
          keys: words.words.map((word) => `${word.paragraphId}:${word.ordinal}`),
          words: words.words.map((word) => word.text),
          paragraphs: words.words.map((word) => word.paragraphId),
          ordinals: words.words.map((word) => word.ordinal),
          start: planned.start,
          end: planned.end,
          narratorId: found?.narrator.id ?? '',
          narratorName: planned.narrator,
          fileId,
          sourceStart,
          sourceEnd,
          gainDb,
          measuredLufs: planned.measuredLufs,
          targetLufs: planned.targetLufs,
          fadeMs,
          shift: planned.shift,
          daw: 'REAPER',
          undoSteps: 1,
          at: now(),
          restoredAt: null,
        },
      ];
      const count = planned.words;
      return answer(chapterId, ok(`Replaced ${count} ${count === 1 ? 'word' : 'words'} with ${planned.narrator}'s audio in REAPER.`, true), id);
    },
    dawRestoreReplacement: async (chapterId, replacementId) => {
      await deps.ready;
      const off = deps.available?.();
      if (off) return answer(chapterId, off, replacementId);
      const stored = replacements.find((candidate) => candidate.chapterId === chapterId && candidate.id === replacementId && candidate.restoredAt === null);
      if (!stored) return answer(chapterId, refused('That replacement is not in this chapter any more, so nothing changed.'), replacementId);
      replacements = replacements.map((candidate) => (candidate === stored ? { ...candidate, restoredAt: now() } : candidate));
      const count = stored.words.length;
      return answer(chapterId, ok(`Put your audio back for ${count} ${count === 1 ? 'word' : 'words'} in REAPER.`, true), replacementId);
    },
    editingReplacementsList: async (chapterId) => {
      await deps.ready;
      return chapterList(chapterId);
    },
    editingReplacementRemove: async (chapterId, id): Promise<ReplacementsChange> => {
      await deps.ready;
      if (!id) throw new Error('choose a replacement first');
      const before = replacements.length;
      replacements = replacements.filter((candidate) => !(candidate.chapterId === chapterId && candidate.id === id));
      return { ...chapterList(chapterId), changed: replacements.length < before ? [id] : [] };
    },
    replaceFilePeaks: async (fileId): Promise<ReplaceFilePeaks> => {
      await deps.ready;
      const found = fileOf(fileId);
      if (!found) throw new Error('that file of theirs is not in this project');
      return { fileId, length: found.file.length, peaks: demoPeaks(found.file.length) };
    },
  };
}

/** A speech-like waveform for the demo file at 10 buckets a second: words of 0.2 to 0.5 s with short pauses between. */
function demoPeaks(length: number) {
  const perSecond = 10;
  const buckets = Math.ceil(length * perSecond);
  const bytes = new Uint8Array(buckets * 2);
  for (let i = 0; i < buckets; i++) {
    const phase = (i * 7919) % 23;
    const level = phase < 4 ? 4 : 40 + ((i * 104729) % 70);
    bytes[i * 2] = (256 - level) & 0xff;
    bytes[i * 2 + 1] = level;
  }
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return { startSeconds: 0, bucketsPerSecond: perSecond, buckets, minMax: btoa(binary), sampleRate: 22050, channels: 1 };
}
