import { ROWS } from './rows';
import type { UsedPage } from './types';

/** The pages that read an asset whatever a setting says: the host's kinds that no choice in `rows.ts` points at. */
const FIXED_PAGES: Record<string, readonly UsedPage[]> = {
  dictionary: ['script', 'bible'],
  encoder: ['delivery', 'master'],
  wiktextract: ['bible', 'script'],
  moonshine: ['booth'],
  tts: ['bible', 'script'],
  analysis: ['bible'],
};

/** The registry kinds a row's `followRow` choice can be (the Booth's live model is Whisper's or Moonshine's). */
const FOLLOWING_KINDS: readonly string[] = ['whisper', 'moonshine'];

const PAGE_ORDER: readonly UsedPage[] = ['production', 'schedule', 'script', 'bible', 'booth', 'editing', 'proof', 'pickups', 'master', 'delivery'];

/** The pages that read an asset: those of every setting with a choice that points at it, and the fixed ones for its kind. */
export function assetPages(ref: { kind: string; id: string }): UsedPage[] {
  const pages = new Set<UsedPage>(FIXED_PAGES[ref.kind] ?? []);
  for (const row of ROWS) {
    for (const note of Object.values(row.options ?? {})) {
      const target = note.asset;
      if (!target || target.id !== ref.id) continue;
      const kinds = typeof target.kind === 'string' ? [target.kind] : FOLLOWING_KINDS;
      if (kinds.includes(ref.kind)) for (const page of row.used) pages.add(page);
    }
  }
  return PAGE_ORDER.filter((page) => pages.has(page));
}

export type AssetGroup = 'speech' | 'voice' | 'language' | 'tool';

export const GROUP_OF_KIND: Record<string, AssetGroup> = {
  whisper: 'speech',
  moonshine: 'speech',
  tts: 'voice',
  spacy: 'language',
  dictionary: 'language',
  wiktextract: 'language',
  encoder: 'tool',
};

export const ASSET_FILTERS: ReadonlyArray<{ value: 'all' | AssetGroup; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'speech', label: 'Speech to text' },
  { value: 'voice', label: 'Voices' },
  { value: 'language', label: 'Language' },
  { value: 'tool', label: 'Tools' },
];

/** What "Download the recommended set" fetches: a transcription model to check recordings and a voice to preview names (about 600 MB). */
export const RECOMMENDED_SET: ReadonlyArray<{ kind: string; id: string }> = [
  { kind: 'whisper', id: 'small' },
  { kind: 'tts', id: 'en_US-ljspeech-high' },
];
