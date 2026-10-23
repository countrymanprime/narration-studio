import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useMemo, useState } from 'react';
import { expect, within } from 'storybook/test';
import { ApiProvider } from '../../../../../api/ApiContext';
import type { DictionaryLookupResult } from '../../../../../api/contracts/dictionary';
import { createMockApi } from '../../../../../api/mockApi';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import { useScriptView } from '../../data/useScriptData';
import { WordsTab } from './WordsTab';
import { ONLINE_SOURCE_ID, type DefinitionSource, type WordsHost } from './wordsHost';

// The Words tab as the mock's Script page draws it (docs/research/mockups/studio-next/src/pages/script/WordsTab.tsx), over the browser mock
// host. The tab reads the host through the page's data hooks, so each story seeds the mock: it flags the first words of the chapter,
// optionally gives the first a say-value, and shows one word's card.

const CHAPTER = 'chapter-1';

const LOCAL: DictionaryLookupResult = {
  status: 'ok',
  query: 'sample',
  dictionary: { attribution: 'Open English WordNet, CC BY 4.0' } as never,
  entries: [
    {
      headword: 'sample',
      partOfSpeech: 'noun',
      senses: [{ definition: 'a small part that shows what the whole is like', examples: [], synonyms: [], antonyms: [] }],
    },
  ],
};
const MISSING: DictionaryLookupResult = {
  status: 'asset_required',
  dictionary: { displayName: 'Open English WordNet' } as never,
  installState: 'not_installed',
  downloadSize: 1,
  diskSize: 2,
  installPath: '',
};

type Setup = {
  words: number;
  say?: boolean;
  show?: 'first' | 'unflagged' | 'none';
  source?: DefinitionSource;
  local?: DictionaryLookupResult;
  offline?: boolean;
  /** A Story Bible with no entries, so no name of it shows in the table (the chapter text names some by default). */
  noBible?: boolean;
};

function Show({ word }: { word: string | null }) {
  const [, update] = useScriptView(() => null);
  useEffect(() => update({ word }), [update, word]);
  return null;
}

function Seeded({ words, say = false, show = 'first', source = 'web', local, offline = false, noBible = false }: Setup) {
  const api = useMemo(() => {
    const base = createMockApi();
    const quiet = noBible ? { ...base, guideEntities: async () => [] } : base;
    return local ? { ...quiet, systemLookup: async () => local } : quiet;
  }, [local, noBible]);
  const [state, setState] = useState<{ first: string | null; spare: LineSpare | null } | null>(null);
  useEffect(() => {
    void (async () => {
      const lines = await api.manuscriptParagraphs(CHAPTER);
      let first: string | null = null;
      for (const line of lines.slice(0, words)) {
        const match = /\p{L}+/u.exec(line.text)!;
        const flagged = await api.scriptWordFlag(CHAPTER, line.id, match.index, match.index + match[0].length);
        first ??= flagged.word;
        if (say && flagged.word === first) await api.scriptWordSay(flagged.word, 'for example', 'cmu');
      }
      const spare = lines[words] ?? lines[0]!;
      const match = /\p{L}+/u.exec(spare.text)!;
      setState({
        first,
        spare: { word: match[0].toLowerCase(), range: { chapterId: CHAPTER, paragraphId: spare.id, start: match.index, end: match.index + match[0].length } },
      });
    })();
  }, [api, words, say]);
  const [definition, setDefinition] = useState<DefinitionSource>(source);
  const host: WordsHost = {
    definitionSource: definition,
    setDefinitionSource: setDefinition,
    candidate: async () => ({ ok: true, say: 'KAN-dee' }),
    onlineDefinition: async (word) => {
      if (offline) throw new Error('you appear to be offline');
      return {
        word,
        source: ONLINE_SOURCE_ID,
        label: 'Merriam-Webster',
        notation: 'Merriam-Webster respelling',
        found: true,
        pronunciations: [{ headword: word, spelling: 'ˈsam-pəl' }],
        suggestions: [],
        cached: false,
        fetchedAt: '2026-10-11T00:00:00Z',
      };
    },
    openLookup: async () => undefined,
    installPrompt: () => (
      <button type="button" className="ml-2 underline">
        Download dictionary
      </button>
    ),
  };
  if (!state) return null;
  const shown = show === 'first' ? state.first : show === 'unflagged' ? state.spare!.word : null;
  return (
    <ApiProvider api={api}>
      <StudioProvider>
        <Show word={shown} />
        <div className="max-w-sm rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <WordsTab chapterId={CHAPTER} host={host} selection={state.spare!.range} />
        </div>
      </StudioProvider>
    </ApiProvider>
  );
}
type LineSpare = { word: string; range: { chapterId: string; paragraphId: string; start: number; end: number } };

const meta = { title: 'Script/WordsTab', component: Seeded, args: { words: 3, show: 'none' } } satisfies Meta<typeof Seeded>;
export default meta;
type Story = StoryObj<typeof meta>;

// The table "In this chapter": several words, some set.
export const SeveralWords: Story = {
  args: { words: 4, say: true },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('table', { name: 'Words in this chapter' })).toBeTruthy();
  },
};

export const NoWordsMarked: Story = {
  args: { words: 0, noBible: true },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('No words marked for pronunciation in this chapter.')).toBeTruthy();
  },
};

// The word card for each status: Set, Not set, Not flagged (with the plus button).
export const CardSet: Story = { args: { say: true, show: 'first' } };
export const CardNotSet: Story = { args: { show: 'first' } };
export const CardNotFlagged: Story = { args: { show: 'unflagged' } };

// The definition block for each source state.
export const DefinitionWebPage: Story = { args: { show: 'first', source: 'web' } };
export const DefinitionLocal: Story = { args: { show: 'first', source: 'local', local: LOCAL } };
export const DefinitionLocalNotInstalled: Story = { args: { show: 'first', source: 'local', local: MISSING } };
export const DefinitionOnline: Story = { args: { show: 'first', source: 'api' } };
export const DefinitionOnlineUnreachable: Story = { args: { show: 'first', source: 'api', offline: true } };
