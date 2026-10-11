// @vitest-environment jsdom
// The Words tab over the browser mock host (`createMockApi`) and a fake `WordsHost`: the table, the word card, the source tag, the
// definitions for each source, "Use", the fixed web links, "Add to my words" and the wording the mock leaves out.
import { useEffect } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../../../api/ApiContext';
import type { PronunciationOnlineResult } from '../../../../../api/contracts/pronunciationOnline';
import { createMockApi } from '../../../../../api/mockApi';
import { useScriptView } from '../../data/useScriptData';
import { StudioProvider } from '../../../../../studio/StudioProvider';
import type { NarrationApi } from '../../../../../types';
import { TooltipProvider } from '../../../../primitives/Tooltip';
import { DEFINITION_SOURCES, type DefinitionSource, type WordsHost } from './wordsHost';
import { WordsTab } from './WordsTab';

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
    candidate: vi.fn(async () => ({ ok: true as const, say: 'KAN-dee' })),
    onlineDefinition: vi.fn(async () => ONLINE),
    openLookup: vi.fn(async () => undefined),
    ...over,
  };
}

/** Flags the first word of the first two lines of the chapter, so the table has two rows. */
async function flagTwo() {
  const lines = await api.manuscriptParagraphs(CHAPTER);
  const found: string[] = [];
  for (const line of lines.slice(0, 2)) {
    const match = /\p{L}+/u.exec(line.text)!;
    const flagged = await api.scriptWordFlag(CHAPTER, line.id, match.index, match.index + match[0].length);
    found.push(flagged.word);
  }
  return found;
}

function mount(host: WordsHost, props: { chapterId?: string; selection?: Parameters<typeof WordsTab>[0]['selection'] } = {}) {
  return render(
    <ApiProvider api={api}>
      <StudioProvider>
        <TooltipProvider>
          <WordsTab chapterId={props.chapterId ?? CHAPTER} host={host} selection={props.selection} />
        </TooltipProvider>
      </StudioProvider>
    </ApiProvider>,
  );
}

beforeEach(async () => {
  api = createMockApi();
  words = await flagTwo();
});
afterEach(cleanup);

/** A table row by its word: the row's name starts with the word, so a word inside another word's name does not match. */
const named = (word: string) => new RegExp(`^${word}\\b`, 'i');
const row = (word: string) => screen.getByRole('row', { name: named(word) });

describe('table-lists-the-chapters-words-with-their-status', () => {
  it('lists each flagged word with its say-value, source icon and status; Enter or a click selects it', async () => {
    await api.scriptWordSay(words[0]!, 'uh-LIS', 'cmu');
    mount(fakeHost());
    const first = await screen.findByRole('row', { name: named(words[0]!) });
    expect(within(first).getByText('uh-LIS')).toBeTruthy();
    expect(within(first).getByLabelText('Source: CMU dictionary')).toBeTruthy();
    expect(within(first).getByText('Set')).toBeTruthy();
    expect(within(row(words[1]!)).getByText('Not set')).toBeTruthy();
    expect(first.getAttribute('aria-selected')).toBe('false');
    await userEvent.click(first);
    expect(row(words[0]!).getAttribute('aria-selected')).toBe('true');
    row(words[1]!).focus();
    await userEvent.keyboard('{Enter}');
    expect(row(words[1]!).getAttribute('aria-selected')).toBe('true');
    expect(row(words[0]!).getAttribute('aria-selected')).toBe('false');
  });

  it('lists only words flagged in this chapter', async () => {
    mount(fakeHost(), { chapterId: 'no-such-chapter' });
    expect(await screen.findByText('No words marked for pronunciation in this chapter.')).toBeTruthy();
  });
});

describe('word-card-saves-how-i-say-it', () => {
  it('Save and Enter call saveSay with the manual source, and the pill follows', async () => {
    const say = vi.spyOn(api, 'scriptWordSay');
    mount(fakeHost());
    await userEvent.click(await screen.findByRole('row', { name: named(words[0]!) }));
    const input = await screen.findByLabelText('How I will say it');
    await userEvent.type(input, 'kroh-KAY');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(say).toHaveBeenLastCalledWith(words[0], 'kroh-KAY', 'manual');
    await waitFor(() => expect(within(row(words[0]!)).getByText('Set')).toBeTruthy());
    await userEvent.clear(input);
    await userEvent.type(input, 'kroh-KEE{Enter}');
    expect(say).toHaveBeenLastCalledWith(words[0], 'kroh-KEE', 'manual');
  });

  it('an empty save leaves the word Not set', async () => {
    const say = vi.spyOn(api, 'scriptWordSay');
    mount(fakeHost());
    await userEvent.click(await screen.findByRole('row', { name: named(words[0]!) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(say).not.toHaveBeenCalled();
    expect(within(row(words[0]!)).getByText('Not set')).toBeTruthy();
  });
});

describe('source-tag-switches-the-source', () => {
  async function openCard(host: WordsHost) {
    mount(host);
    await userEvent.click(await screen.findByRole('row', { name: named(words[0]!) }));
    await screen.findByLabelText('How I will say it');
  }
  const pickSource = async (label: string) => {
    await userEvent.click(await screen.findByRole('button', { name: /^Pronunciation source for .*/ }));
    await userEvent.click(await screen.findByRole('button', { name: label }));
  };

  it('a source that answers fills the value and records its id', async () => {
    const say = vi.spyOn(api, 'scriptWordSay');
    const host = fakeHost();
    await openCard(host);
    await pickSource('CMU dictionary');
    expect(host.candidate).toHaveBeenCalledWith(words[0], 'cmu');
    await waitFor(() => expect(say).toHaveBeenLastCalledWith(words[0], 'KAN-dee', 'cmu'));
    expect((screen.getByLabelText('How I will say it') as HTMLInputElement).value).toBe('KAN-dee');
  });

  it('a source that cannot answer leaves the value and says why', async () => {
    const say = vi.spyOn(api, 'scriptWordSay');
    const host = fakeHost({ candidate: vi.fn(async () => ({ ok: false as const, reason: 'CMU dictionary has nothing for “x”.' })) });
    await openCard(host);
    await pickSource('CMU dictionary');
    expect(await screen.findByText('CMU dictionary has nothing for “x”.')).toBeTruthy();
    expect(say).not.toHaveBeenCalled();
    expect((screen.getByLabelText('How I will say it') as HTMLInputElement).value).toBe('');
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

describe('use-on-a-definition-records-its-source', () => {
  it('Use fills the input with the definition’s pronunciation and saves with its source id', async () => {
    const say = vi.spyOn(api, 'scriptWordSay');
    mount(fakeHost({ definitionSource: 'api' }));
    await userEvent.click(await screen.findByRole('row', { name: named(words[0]!) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Use' }));
    expect((screen.getByLabelText('How I will say it') as HTMLInputElement).value).toBe('ˈa-ləs');
    await waitFor(() => expect(say).toHaveBeenLastCalledWith(words[0], 'ˈa-ləs', 'merriam_webster'));
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

describe('add-to-my-words', () => {
  /** Shows a word the chapter has no flag for, as the reader's look-up does, with the reader's selection of it. */
  function ShowWord({ word }: { word: string }) {
    const [, update] = useScriptView(() => null);
    useEffect(() => update({ word }), [update, word]);
    return null;
  }
  async function unflaggedSelection() {
    const line = (await api.manuscriptParagraphs(CHAPTER))[2]!;
    const match = /\p{L}+/u.exec(line.text)!;
    return { word: match[0].toLowerCase(), range: { chapterId: CHAPTER, paragraphId: line.id, start: match.index, end: match.index + match[0].length } };
  }
  function mountWithWord(word: string, range?: Parameters<typeof WordsTab>[0]['selection']) {
    return render(
      <ApiProvider api={api}>
        <StudioProvider>
          <TooltipProvider>
            <ShowWord word={word} />
            <WordsTab chapterId={CHAPTER} host={fakeHost()} selection={range} />
          </TooltipProvider>
        </StudioProvider>
      </ApiProvider>,
    );
  }

  it('a word not yet flagged shows the plus button, which flags the selection through the hook', async () => {
    const { word, range } = await unflaggedSelection();
    const flag = vi.spyOn(api, 'scriptWordFlag');
    mountWithWord(word, range);
    await userEvent.click(await screen.findByRole('button', { name: 'Add to my words' }));
    expect(flag).toHaveBeenCalledWith(range.chapterId, range.paragraphId, range.start, range.end);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add to my words' })).toBeNull());
    expect(within(row(word)).getByText('Not set')).toBeTruthy();
  });

  it('a flagged word has no plus button, and an unflagged word with no selection has none either', async () => {
    const { word } = await unflaggedSelection();
    mountWithWord(words[0]!);
    await screen.findByLabelText('How I will say it');
    expect(screen.queryByRole('button', { name: 'Add to my words' })).toBeNull();
    cleanup();
    mountWithWord(word);
    await screen.findByLabelText('How I will say it');
    expect(screen.queryByRole('button', { name: 'Add to my words' })).toBeNull();
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
