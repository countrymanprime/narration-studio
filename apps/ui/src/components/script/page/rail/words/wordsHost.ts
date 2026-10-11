// What the Words tab needs from the host that the Script page's data hooks (`../../data/useScriptData.ts`) do not give yet: the
// definition-source preference, one source's candidate for a word, Merriam-Webster's answer for one word, the fixed web look-ups and the
// dictionary's install prompt. The tab takes them as one prop so no file here names a port (`data/noHostCalls.test.ts`); the page that
// mounts the tab (SN-B77) builds it from the hooks the data layer gains for these calls.

import type { ReactNode } from 'react';
import type { DictionaryLookupResult } from '../../../../../api/contracts/dictionary';
import type { PronunciationLookupSource } from '../../../../../api/contracts/pronunciationLookup';
import type { PronunciationOnlineResult } from '../../../../../api/contracts/pronunciationOnline';
import type { PronunciationCandidate } from '../../../../../api/contracts/pronunciationSources';

/** Where definitions come from: the web page (nothing inline), the offline dictionary, or Merriam-Webster's online service. */
export const DEFINITION_SOURCES = { web: 'Web page', local: 'Local dictionary', api: 'Online service' } as const;
export type DefinitionSource = keyof typeof DEFINITION_SOURCES;

/** The pronunciation source whose answer the online service's "Use" saves. */
export const ONLINE_SOURCE_ID = 'merriam_webster';

export type DictionaryGate = Extract<DictionaryLookupResult, { status: 'asset_required' }>;

export type WordsHost = {
  /** The narrator's saved choice of where definitions come from. */
  definitionSource: DefinitionSource;
  setDefinitionSource: (source: DefinitionSource) => void;
  /** Asks one pronunciation source how it would say a word; changes nothing. A miss is a result, never a throw. */
  candidate: (word: string, sourceId: string) => Promise<PronunciationCandidate>;
  /** Merriam-Webster's entry for one word (D72: one word, the narrator's own choice of that source). Rejects with the host's sentence. */
  onlineDefinition: (word: string) => Promise<PronunciationOnlineResult>;
  /** Opens a fixed look-up page for a word in the browser; the host builds the address, never the page. */
  openLookup: (source: PronunciationLookupSource, word: string) => Promise<void>;
  /** The dictionary's download question (the old reader's `DictionaryInstallPrompt`), shown where the dictionary is missing; `done` reads the word again. */
  installPrompt?: (gate: DictionaryGate, done: () => void) => ReactNode;
};
