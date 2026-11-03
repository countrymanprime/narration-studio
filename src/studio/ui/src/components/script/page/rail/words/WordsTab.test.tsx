// @vitest-environment jsdom
// The Words tab over the browser mock host (`createMockApi`) and a fake `WordsHost`: the table, the word card, the source tag, the
// definitions for each source, "Use", the fixed web links, the dictionaries' candidates and "Save to my dictionary" for a word no
// dictionary has, and the wording the mock leaves out. Every row is a Story Bible
// name and every value is that entry's (#2595): a word the narrator adds is an entry of the type Word.
import { useEffect } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../../api/ApiContext';
import type { PronunciationOnlineResult } from '../../../../../api/contracts/pronunciationOnline';
import { createMockApi } from '../../../../../api/mockApi';
import { useScriptView } from '../../data/useScriptData';
import { overlay } from '../../../../../overlay/overlayService';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import type { NarrationApi } from '../../../../../types';
import { TooltipProvider } from '../../../../primitives/Tooltip';
import { DEFINITION_SOURCES, type DefinitionSource, type WordsHost } from './wordsHost';
import { WordsTab } from './WordsTab';
import { useWordsHost } from '../../../scriptPageHost';

const CHAPTER = 'chapter-1';
let api: NarrationApi;
let words: string[];

const ONLINE: PronunciationOnlineResult = {
  word: 'x',
  source: 'merriam_webster',
  label: 'Merriam-Webster',
  notation: 'Merriam-Webster respelling',
  found: true,
  pronunciations: [{ headword: 'x', spelling: 'ˈa-ləs' }],
  suggestions: [],
  cached: false,
  fetchedAt: '2026-10-11T00:00:00Z',
};

function fakeHost(over: Partial<WordsHost> = {}): WordsHost {
  return {
    definitionSource: 'web',
    setDefinitionSource: vi.fn(),
    onlineDefinition: vi.fn(async () => ONLINE),
    openLookup: vi.fn(async () => undefined),
    ...over,
  };
}

/** Two words of the chapter that are no Story Bible name, added as the narrator adds a word: entries of the type Word. */
const WORDS = ['beginning', 'considering'];
let ids: Record<string, string>;
async function addTwo() {
  ids = {};
  for (const word of WORDS) ids[word] = await api.guideCreate(word, 'Item', []);
  return WORDS;
}

function mount(host: WordsHost, props: { chapterId?: string } = {}) {
  return render(
    <ApiProvider api={api}>
      <StudioProvider>
        <TooltipProvider>
          <WordsTab chapterId={props.chapterId ?? CHAPTER} host={host} />
        </TooltipProvider>
      </StudioProvider>
    </ApiProvider>,
  );
}

beforeEach(async () => {
  api = createMockApi();
  words = await addTwo();
});
afterEach(cleanup);

/** A table row by its word: the row's name starts with the word, so a word inside another word's name does not match. */
const named = (word: string) => new RegExp(`^${word}\\b`, 'i');
/** The pronunciation play button of a row: there when the word has a pronunciation, absent when it has none. */
const hear = (of: HTMLElement) => within(of).queryByRole('button', { name: /^Hear / });
const row = (word: string) => screen.getByRole('row', { name: named(word) });

describe('list-shows-the-chapters-words-with-a-play-button', () => {
  it('lists each word with a play button and source icon once said, no phonetic text and no status; Enter or a click selects it', async () => {
    await api.guidePronounceUser(ids[words[0]!]!, 'bih-GIN-ing');
    mount(fakeHost());
    const first = await screen.findByRole('row', { name: named(words[0]!) });
    expect(within(first).queryByText('bih-GIN-ing')).toBeNull();
    expect(within(first).getByLabelText('Source: Entered by me')).toBeTruthy();
    expect(hear(first)).not.toBeNull();
    // Not said yet: nothing to play and no source.
    expect(hear(row(words[1]!))).toBeNull();
    expect(within(row(words[1]!)).queryByLabelText(/^Source:/)).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Status' })).toBeNull();
    expect(first.getAttribute('aria-selected')).toBe('false');
    await userEvent.click(first);
    expect(row(words[0]!).getAttribute('aria-selected')).toBe('true');
    row(words[1]!).focus();
    await userEvent.keyboard('{Enter}');
    expect(row(words[1]!).getAttribute('aria-selected')).toBe('true');
    expect(row(words[0]!).getAttribute('aria-selected')).toBe('false');
  });

  it("a character or place in the text is a row like any word, its value the entry's, and opens the same card (#2595)", async () => {
    mount(fakeHost());
    const rabbit = await screen.findByRole('row', { name: named('White Rabbit') });
    expect(hear(rabbit)).not.toBeNull();
    expect(within(rabbit).queryByText(/ˈræbɪt/)).toBeNull();
    await userEvent.click(rabbit);
    expect(rabbit.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('group', { name: 'Word: White Rabbit' })).toBeTruthy();
  });

  it('lists nothing for a chapter with no Story Bible names in its text', async () => {
    mount(fakeHost(), { chapterId: 'no-such-chapter' });
    expect(await screen.findByText('No words marked for pronunciation in this chapter.')).toBeTruthy();
  });
});

describe('word-card-edits-the-story-bible-name (#2595)', () => {
  it("typing and Enter is the narrator's own value on the entry, one journal entry, and the row follows", async () => {
    const own = vi.spyOn(api, 'guidePronounceUser');
    mount(fakeHost());
    await userEvent.click(await screen.findByRole('row', { name: named(words[0]!) }));
    const input = await screen.findByLabelText(`How I say ${words[0]}`);
    await userEvent.type(input, 'kroh-KAY{Enter}');
    await waitFor(() => expect(own).toHaveBeenLastCalledWith(ids[words[0]!], 'kroh-KAY'));
    await waitFor(() => expect(within(row(words[0]!)).getByLabelText(/^Source:/)).toBeTruthy());
  });

  it('an empty value writes nothing and the word stays Not set', async () => {
    const own = vi.spyOn(api, 'guidePronounceUser');
    mount(fakeHost());
    await userEvent.click(await screen.findByRole('row', { name: named(words[0]!) }));
    const input = await screen.findByLabelText(`How I say ${words[0]}`);
    await userEvent.type(input, '{Enter}');
    expect(own).not.toHaveBeenCalled();
    expect(within(row(words[0]!)).queryByLabelText(/^Source:/)).toBeNull();
  });
});

describe('source-tag-switches-the-source', () => {
  const pickSource = async (label: string) => {
    await userEvent.click(await screen.findByRole('button', { name: /^Pronunciation source for .*/ }));
    await userEvent.click(await screen.findByRole('button', { name: label }));
  };

  it('a source that answers is applied to the Story Bible name by the host', async () => {
    const pronounce = vi.spyOn(api, 'guidePronounce');
    mount(fakeHost());
    await userEvent.click(await screen.findByRole('row', { name: named('Alice') }));
    await screen.findByLabelText('How I say Alice');
    await pickSource('CMU dictionary');
    await waitFor(() => expect(pronounce).toHaveBeenLastCalledWith(expect.any(String), 'cmu'));
  });

  it('a source that cannot answer leaves the value and says why', async () => {
    const pronounce = vi.spyOn(api, 'guidePronounce');
    const toast = vi.spyOn(overlay, 'toast');
    mount(fakeHost());
    await userEvent.click(await screen.findByRole('row', { name: named(words[0]!) }));
    await screen.findByLabelText(`How I say ${words[0]}`);
    await pickSource('CMU dictionary');
    await waitFor(() => expect(toast).toHaveBeenCalledWith(`CMU dictionary has nothing for “${words[0]}”.`, undefined));
    expect(pronounce).not.toHaveBeenCalled();
    expect((screen.getByLabelText(`How I say ${words[0]}`) as HTMLInputElement).value).toBe('');
  });
});

describe('definitions-follow-the-source-preference', () => {
  async function openCard(host: WordsHost) {
    mount(host);
    await userEvent.click(await screen.findByRole('row', { name: named(words[0]!) }));
    await screen.findByLabelText('How I will say it');
  }

  it('Web page shows nothing inline and asks nothing', async () => {
    const lookup = vi.spyOn(api, 'systemLookup');
    const host = fakeHost();
    await openCard(host);
    expect(screen.queryByText(/not installed|cannot be reached/)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
    expect(host.onlineDefinition).not.toHaveBeenCalled();
  });

  it('Local dictionary shows the definition from the dictionary lookup', async () => {
    vi.spyOn(api, 'systemLookup').mockResolvedValue({
      status: 'ok',
      query: words[0]!,
      dictionary: { attribution: 'Open English WordNet, CC BY 4.0' } as never,
      entries: [{ headword: words[0]!, partOfSpeech: 'noun', senses: [{ definition: 'a sample meaning', examples: [], synonyms: [], antonyms: [] }] }],
    });
    await openCard(fakeHost({ definitionSource: 'local' }));
    expect(await screen.findByText(/a sample meaning/)).toBeTruthy();
  });

  it('Local dictionary not installed says so and shows the existing download prompt', async () => {
    vi.spyOn(api, 'systemLookup').mockResolvedValue({
      status: 'asset_required',
      dictionary: { displayName: 'WordNet' } as never,
      installState: 'not_installed',
      downloadSize: 1,
      diskSize: 2,
      installPath: 'x',
    });
    await openCard(fakeHost({ definitionSource: 'local', installPrompt: () => <button type="button">Download dictionary</button> }));
    expect(await screen.findByText(/is not installed/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download dictionary' })).toBeTruthy();
  });

  it('Online service asks for the one word only, and shows Merriam-Webster’s answer (D72)', async () => {
    const host = fakeHost({ definitionSource: 'api' });
    await openCard(host);
    expect(await screen.findByText(/ˈa-ləs/)).toBeTruthy();
    expect(host.onlineDefinition).toHaveBeenCalledTimes(1);
    expect(vi.mocked(host.onlineDefinition).mock.calls[0]).toEqual([words[0]]);
  });

  it('Online service that cannot be reached says so and points to the web links', async () => {
    await openCard(fakeHost({ definitionSource: 'api', onlineDefinition: vi.fn(async () => Promise.reject(new Error('you are offline'))) }));
    expect(await screen.findByText(/cannot be reached/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Forvo' })).toBeTruthy();
  });

  it('the definition-source menu lists the three sources and reports the pick', async () => {
    const host = fakeHost();
    mount(host);
    await userEvent.click(await screen.findByRole('button', { name: /Definition source/ }));
    for (const label of Object.values(DEFINITION_SOURCES)) expect(await screen.findByRole('button', { name: label })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: DEFINITION_SOURCES.local }));
    expect(host.setDefinitionSource).toHaveBeenCalledWith('local' satisfies DefinitionSource);
  });
});

describe('the definition source is a host setting (SN-M93)', () => {
  const LEGACY_KEY = 'narration.script.definitions';
  const sourceButton = () => screen.findByRole('button', { name: /^Definition source:/ });
  const held = async () => (await api.settingsForScope('global')).Script?.find((field) => field.key === 'definition_source');

  function HostedTab() {
    return <WordsTab chapterId={CHAPTER} host={useWordsHost()} />;
  }
  const mountHosted = () =>
    render(
      <ApiProvider api={api}>
        <StudioProvider>
          <TooltipProvider>
            <HostedTab />
          </TooltipProvider>
        </StudioProvider>
      </ApiProvider>,
    );
  afterEach(() => window.localStorage.clear());

  it('reads the definition source from the host, and a choice made in Settings shows there', async () => {
    await api.saveSettings('Script', 'global', { definition_source: 'local' });
    mountHosted();
    await screen.findByRole('button', { name: 'Definition source: Local dictionary' });
    // Settings saves another source while the tab is mounted; the window coming back reads it.
    await api.saveSettings('Script', 'global', { definition_source: 'api' });
    window.dispatchEvent(new Event('focus'));
    await screen.findByRole('button', { name: 'Definition source: Online service' });
    // A choice in the tab is saved to the host, where Settings reads it.
    await userEvent.click(await sourceButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Web page' }));
    await waitFor(async () => expect((await held())?.value).toBe('web'));
  });

  it('moves a source kept in localStorage to the host once', async () => {
    window.localStorage.setItem(LEGACY_KEY, 'api');
    const save = vi.spyOn(api, 'saveSettings');
    mountHosted();
    await screen.findByRole('button', { name: 'Definition source: Online service' });
    expect((await held())?.value).toBe('api');
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    const moves = save.mock.calls.length;
    cleanup();
    mountHosted();
    await screen.findByRole('button', { name: 'Definition source: Online service' });
    expect(save).toHaveBeenCalledTimes(moves);
  });

  it('keeps the source the host already holds over one left in localStorage, and forgets the old key', async () => {
    await api.saveSettings('Script', 'global', { definition_source: 'local' });
    window.localStorage.setItem(LEGACY_KEY, 'api');
    mountHosted();
    await screen.findByRole('button', { name: 'Definition source: Local dictionary' });
    await waitFor(() => expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull());
    expect((await held())?.value).toBe('local');
  });
});

describe('use-on-a-definition-records-its-source', () => {
  it('Use saves the definition’s pronunciation as the narrator’s own value on the Story Bible name, and the field shows it', async () => {
    const own = vi.spyOn(api, 'guidePronounceUser');
    mount(fakeHost({ definitionSource: 'api' }));
    await userEvent.click(await screen.findByRole('row', { name: named(words[0]!) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Use' }));
    await waitFor(() => expect(own).toHaveBeenLastCalledWith(ids[words[0]!], 'ˈa-ləs'));
    await waitFor(() => expect((screen.getByLabelText(`How I say ${words[0]}`) as HTMLInputElement).value).toBe('ˈa-ləs'));
  });
});

describe('web-links-open-the-fixed-templates', () => {
  it('each link passes its source id and the word, and the page builds no address', async () => {
    const host = fakeHost();
    mount(host);
    await userEvent.click(await screen.findByRole('row', { name: named(words[0]!) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Definition' }));
    await userEvent.click(screen.getByRole('button', { name: 'Forvo' }));
    await userEvent.click(screen.getByRole('button', { name: 'YouGlish' }));
    expect(vi.mocked(host.openLookup).mock.calls).toEqual([
      ['merriam_webster', words[0]],
      ['forvo', words[0]],
      ['youglish', words[0]],
    ]);
    expect(document.querySelector('a[href]')).toBeNull();
  });
});

describe('a-word-that-is-no-story-element (#2595)', () => {
  function ShowWord({ word }: { word: string }) {
    const [, update] = useScriptView(() => null);
    useEffect(() => update({ word }), [update, word]);
    return null;
  }
  function mountWithWord(word: string) {
    return render(
      <ApiProvider api={api}>
        <StudioProvider>
          <TooltipProvider>
            <ShowWord word={word} />
            <WordsTab chapterId={CHAPTER} host={fakeHost()} />
          </TooltipProvider>
        </StudioProvider>
      </ApiProvider>,
    );
  }

  it('shows what each dictionary says, with its source and Hear, and offers no save while one has it', async () => {
    const preview = vi.spyOn(api, 'pronunciationPreview');
    mountWithWord('croquet');
    const list = await screen.findByRole('list', { name: 'Dictionary candidates for croquet' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.getAttribute('data-source'))).toEqual(['cmu', 'wiktextract', 'espeak']);
    expect(within(rows[0]!).getByText('CMU dictionary')).toBeTruthy();
    await userEvent.click(within(rows[1]!).getByRole('button', { name: /^Hear Wiktionary/ }));
    await waitFor(() => expect(preview).toHaveBeenCalledWith('croquet', '/ˈkɹoʊkeɪ/'));
    expect(screen.queryByRole('button', { name: 'Save to my dictionary' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add to my words/ })).toBeNull();
  });

  it('a word no dictionary has is saved to my dictionary, never the Story Bible, and then reads as a My dictionary candidate', async () => {
    const create = vi.spyOn(api, 'guideCreate');
    mountWithWord('Dinah');
    const field = await screen.findByLabelText('Pronunciation of Dinah for my dictionary');
    await userEvent.type(field, 'DY-nuh{Enter}');
    const list = await screen.findByRole('list', { name: 'Dictionary candidates for Dinah' });
    await waitFor(() => expect(within(list).getByText('My dictionary')).toBeTruthy());
    expect(within(list).getByText('DY-nuh')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save to my dictionary' })).toBeNull();
  });
});

describe('card-states', () => {
  it('a locked entry says so on the card, and its row cannot be changed', async () => {
    await api.guideSetLocked(ids[words[0]!]!, true);
    mount(fakeHost());
    await userEvent.click(await screen.findByRole('row', { name: named(words[0]!) }));
    const card = await screen.findByRole('group', { name: `Word: ${words[0]}` });
    expect(within(card).getByText('Locked')).toBeTruthy();
    expect((within(card).getByLabelText(`How I say ${words[0]}`) as HTMLInputElement).disabled).toBe(true);
  });

  it('a word that is no story element has no Record and no name Hear: its candidates carry their own Hear', async () => {
    function ShowWord() {
      const [, update] = useScriptView(() => null);
      useEffect(() => update({ word: 'croquet' }), [update]);
      return null;
    }
    render(
      <ApiProvider api={api}>
        <StudioProvider>
          <TooltipProvider>
            <ShowWord />
            <WordsTab chapterId={CHAPTER} host={fakeHost()} />
          </TooltipProvider>
        </StudioProvider>
      </ApiProvider>,
    );
    const card = await screen.findByRole('group', { name: 'Word: croquet' });
    expect(within(card).queryByRole('button', { name: /record/i })).toBeNull();
    expect(within(card).queryByRole('button', { name: 'Hear croquet' })).toBeNull();
    expect(await within(card).findAllByRole('button', { name: /^Hear .*: / })).not.toHaveLength(0);
  });
});

describe('no-query-states', () => {
  it('draws no status select, “Query sent” or author-confirmed wording', async () => {
    const { container } = mount(fakeHost({ definitionSource: 'api' }));
    await userEvent.click(await screen.findByRole('row', { name: named(words[0]!) }));
    await screen.findByLabelText('How I will say it');
    expect(container.querySelector('select, [role="combobox"]')).toBeNull();
    expect(container.textContent).not.toMatch(/query sent|author.?confirmed|author ✓/i);
  });
});
