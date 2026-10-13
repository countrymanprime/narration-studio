// The Script page's pure selectors against the mock's rules: the chapter facts line, phrases from the dialogue cues, words,
// entries and mentions. Property tests pin that each is pure: the same input gives the same output and nothing is mutated.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { GuideDialogueCue, GuideEntity, GuideType } from '../../../../api/contracts/storyBible';
import type { Mark, MarkType } from '../../../../api/contracts/marks';
import type { ScriptWord, ScriptWordFlag } from '../../../../api/contracts/scriptPrep';
import { WIRE_DIALOGUE_CUES, WIRE_ENTITIES } from '../../../../api/mockFixtures';
import {
  chapterFacts,
  entriesInChapter,
  entryById,
  findEntries,
  isAsk,
  markMessages,
  marksInChapter,
  mentionsIn,
  openQueries,
  phrasesOf,
  pronOfWord,
  pronStatus,
  speakerCandidates,
  unattributed,
  wordKey,
  wordsInChapter,
  chapterWords,
} from './script.selectors';

const TYPES: MarkType[] = [
  { key: 'stress', name: 'Word stress', colour: 'copper', style: 'highlight', asks: false },
  { key: 'ask', name: 'Query for author', colour: 'warn', style: 'highlight', asks: true },
];

let n = 0;
const mark = (chapterId: string, type: string, extra: Partial<Mark> = {}): Mark => ({
  id: `m${++n}`,
  chapterId,
  paragraphId: `${chapterId}-p`,
  paragraph: 0,
  start: 0,
  end: 3,
  quote: 'The',
  type,
  text: type === 'ask' ? 'Which?' : '',
  status: type === 'ask' ? 'open' : undefined,
  thread: [],
  createdAt: '2026-10-11T00:00:00Z',
  stale: false,
  ...extra,
});

const flag = (chapterId: string): ScriptWordFlag => ({
  id: `f${++n}`,
  chapterId,
  paragraphId: `${chapterId}-p`,
  paragraph: 0,
  start: 0,
  end: 3,
  quote: 'x',
  createdAt: '2026-10-11T00:00:00Z',
  stale: false,
});
const word = (key: string, say: string, flags: ScriptWordFlag[], source = ''): ScriptWord => ({
  word: key,
  say,
  source,
  status: flags.length === 0 ? 'not_flagged' : say ? 'set' : 'not_set',
  flags,
});

const entity = (id: string, name: string, category: string, aliases: string[] = []): GuideEntity => ({
  ...WIRE_ENTITIES[0]!,
  id,
  canonical_name: name,
  category,
  aliases: aliases.map((text) => ({ text, pronunciation: { ipa: '', source: '', confidence: 'pending' }, occurrences: [] })),
});

describe('marks', () => {
  it('a query is a mark whose type asks; open queries leave resolved ones out', () => {
    const open = mark('c1', 'ask');
    const done = mark('c1', 'ask', { status: 'resolved' });
    const note = mark('c1', 'stress');
    expect(isAsk(TYPES, open)).toBe(true);
    expect(isAsk(TYPES, note)).toBe(false);
    expect(isAsk(TYPES, mark('c1', 'gone'))).toBe(false);
    expect(openQueries(TYPES, [open, done, note])).toEqual([open]);
    expect(marksInChapter([open, mark('c2', 'stress')], 'c1')).toEqual([open]);
  });

  it('the opening text is message -1 and the thread follows with its own indexes', () => {
    const m = mark('c1', 'ask', { text: 'Which?', thread: [{ who: 'author', text: 'This one.', at: '2026-10-11T01:00:00Z' }] });
    expect(markMessages(m)).toEqual([
      { who: 'you', text: 'Which?', at: '', index: -1 },
      { who: 'author', text: 'This one.', at: '2026-10-11T01:00:00Z', index: 0 },
    ]);
    expect(markMessages(mark('c1', 'stress'))).toEqual([]);
  });
});

describe('chapter-facts-line-is-pure', () => {
  it('reads the counts with the mock singular and plural rules', () => {
    const input = { types: TYPES, marks: [mark('c1', 'stress'), mark('c1', 'ask')], words: [word('knave', '', [flag('c1')])], unattributed: 0 };
    expect(chapterFacts(input, 'c1')).toBe('1 mark · 1 open query · 1 without pronunciation');
    expect(chapterFacts({ types: TYPES, marks: [], words: [], unattributed: 0 }, 'c1')).toBe('0 marks · 0 open queries · 0 without pronunciation');
  });

  it('adds the speaker clause only when a phrase has no speaker, and counts per chapter', () => {
    const input = {
      types: TYPES,
      marks: [
        mark('c1', 'stress'),
        mark('c1', 'stress'),
        mark('c1', 'ask'),
        mark('c1', 'ask'),
        mark('c1', 'ask', { status: 'resolved' }),
        mark('c2', 'stress'),
      ],
      words: [word('knave', '', [flag('c1'), flag('c1'), flag('c2')]), word('queen', 'kween', [flag('c1')])],
      unattributed: 2,
    };
    expect(chapterFacts(input, 'c1')).toBe('2 marks · 2 open queries · 2 without pronunciation · 2 without a speaker');
    expect(chapterFacts({ ...input, unattributed: 1 }, 'c2')).toBe('1 mark · 0 open queries · 1 without pronunciation · 1 without a speaker');
  });

  it('same input, same output, and the input is not mutated', () => {
    const arbMark = fc.record({ chapterId: fc.constantFrom('c1', 'c2'), type: fc.constantFrom('stress', 'ask', 'gone'), resolved: fc.boolean() });
    const arbWord = fc.record({ say: fc.constantFrom('', 'say'), chapters: fc.array(fc.constantFrom('c1', 'c2'), { maxLength: 3 }) });
    fc.assert(
      fc.property(fc.array(arbMark, { maxLength: 8 }), fc.array(arbWord, { maxLength: 4 }), fc.nat(5), (ms, ws, un) => {
        const input = {
          types: TYPES,
          marks: ms.map((m) => mark(m.chapterId, m.type, m.resolved ? { status: 'resolved' } : {})),
          words: ws.map((w, i) => word(`w${i}`, w.say, w.chapters.map(flag))),
          unattributed: un,
        };
        const copy = structuredClone(input);
        const first = chapterFacts(input, 'c1');
        expect(chapterFacts(input, 'c1')).toBe(first);
        expect(input).toEqual(copy);
        expect(first).toMatch(/^(1 mark|(?!1 )\d+ marks) · (1 open query|(?!1 )\d+ open queries) · \d+ without pronunciation( · [1-9]\d* without a speaker)?$/);
        expect(first.endsWith('without a speaker')).toBe(un > 0);
      }),
    );
  });
});

describe('words-follow-the-mock', () => {
  const words = [word('knave', '', [flag('c1')]), word('queen', 'kween', [flag('c2')], 'cmu'), word('tarts', 'tahts', [flag('c1')])];

  it('statuses are the host statuses and the key ignores case and padding', () => {
    expect(pronStatus(words, 'Knave ')).toBe('not_set');
    expect(pronStatus(words, 'Queen')).toBe('set');
    expect(pronStatus(words, 'dormouse')).toBe('not_flagged');
    expect(wordKey('  Knave ')).toBe('knave');
  });

  it('a value with no source was typed by the narrator', () => {
    expect(pronOfWord(words, 'queen')).toEqual({ say: 'kween', source: 'cmu' });
    expect(pronOfWord(words, 'tarts')).toEqual({ say: 'tahts', source: 'manual' });
    expect(pronOfWord(words, 'knave')).toEqual({ say: '', source: '' });
  });

  it('words of a chapter are those with a flag in it', () => {
    expect(wordsInChapter(words, 'c1').map((w) => w.word)).toEqual(['knave', 'tarts']);
  });
});

describe('entities-and-mentions', () => {
  const entries = [
    entity('hatter', 'Hatter', 'Character', ['Mad Hatter']),
    entity('queen', 'Queen of Hearts', 'Character', ['Queen']),
    entity('wonderland', 'Wonderland', 'Location'),
  ];

  it('finds by any name, ignoring case, in one category or all', () => {
    expect(entryById(entries, 'queen')?.canonical_name).toBe('Queen of Hearts');
    expect(entryById(entries, null)).toBeUndefined();
    expect(findEntries(entries, 'mad', 'All').map((e) => e.id)).toEqual(['hatter']);
    expect(findEntries(entries, '', 'Location').map((e) => e.id)).toEqual(['wonderland']);
    expect(findEntries(entries, 'queen', 'Location')).toEqual([]);
  });

  it('names match longest first, as whole words, ignoring case', () => {
    const text = 'The Mad Hatter met the queen of hearts; the Queenly hatters left Wonderland.';
    expect(mentionsIn(entries, text).map((m) => [m.text, m.entryId, text.slice(m.start, m.end)])).toEqual([
      ['Mad Hatter', 'hatter', 'Mad Hatter'],
      ['queen of hearts', 'queen', 'queen of hearts'],
      ['Wonderland', 'wonderland', 'Wonderland'],
    ]);
    expect(mentionsIn([], text)).toEqual([]);
  });

  it('entries of a chapter are those its paragraphs mention', () => {
    const paragraphs = [{ text: 'Off with his head, said the Queen.' }, { text: 'Nobody else.' }];
    expect(entriesInChapter(entries, paragraphs).map((e) => e.id)).toEqual(['queen']);
  });

  it('mentions are pure', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (text) => {
        const copy = structuredClone(entries);
        const once = mentionsIn(entries, text);
        expect(mentionsIn(entries, text)).toEqual(once);
        expect(entries).toEqual(copy);
        for (let i = 1; i < once.length; i++) expect(once[i]!.start).toBeGreaterThanOrEqual(once[i - 1]!.end);
      }),
    );
  });
});

describe('phrases-come-from-the-dialogue-cues', () => {
  const entries = WIRE_ENTITIES;
  const speaker = entries.find((e) => e.category === 'Character')!;
  const cue = (id: string, paragraphId: string, start: number, speakerId: string | null, source: GuideDialogueCue['speaker_source']): GuideDialogueCue => ({
    ...WIRE_DIALOGUE_CUES[0]!,
    id,
    chapterId: 'c1',
    paragraphId,
    quote_start: start,
    quote_end: start + 5,
    speaker_entity_id: speakerId,
    speaker_source: source,
  });
  const cues = [
    cue('b', 'p1', 20, speaker.id, 'tag'),
    cue('a', 'p1', 0, speaker.id, 'correction'),
    cue('c', 'p1', 40, null, 'unknown'),
    cue('d', 'p2', 0, 'gone', 'tag'),
  ];

  it('confirmed for a correction, suggested otherwise, unknown when none, in reading order', () => {
    const phrases = phrasesOf(cues, entries, { id: 'p1', chapterId: 'c1' });
    expect(phrases.map((p) => [p.cueId, p.state, p.speaker?.id ?? null])).toEqual([
      ['a', 'confirmed', speaker.id],
      ['b', 'suggested', speaker.id],
      ['c', 'unknown', null],
    ]);
    expect(phrasesOf(cues, entries, { id: 'p1', chapterId: 'c2' })).toEqual([]);
  });

  it('unattributed counts the unknown phrases of a chapter, a missing entry included', () => {
    expect(unattributed(cues, entries, 'c1')).toBe(2);
    expect(unattributed(cues, entries, 'c2')).toBe(0);
  });

  it('speaker candidates are the entries whose type can speak', () => {
    const types: GuideType[] = [{ name: 'Character', colour: 'green', speaks: true }];
    expect(speakerCandidates(entries, types).every((e) => e.category === 'Character')).toBe(true);
    expect(speakerCandidates(entries, types)).toContain(speaker);
    expect(speakerCandidates(entries, [{ name: 'Character', colour: 'green', speaks: false }])).toEqual([]);
  });
});

describe('a renamed or removed alias keeps or drops its confirmed lines', () => {
  const speaker = WIRE_ENTITIES.find((e) => e.category === 'Character')!;
  const withAliases = (...texts: string[]): GuideEntity => ({ ...speaker, aliases: texts.map((text) => ({ ...speaker.aliases[0]!, text })) });
  const confirmed: GuideDialogueCue = {
    ...WIRE_DIALOGUE_CUES[0]!,
    id: 'k1',
    chapterId: 'c1',
    paragraphId: 'p1',
    quote_start: 0,
    quote_end: 5,
    speaker_entity_id: speaker.id,
    speaker_source: 'correction',
  };
  const paragraph = { id: 'p1', chapterId: 'c1' };
  const state = (entries: readonly GuideEntity[]) => phrasesOf([confirmed], entries, paragraph).map((p) => [p.state, p.speaker?.id ?? null]);

  it('renaming an entry or an alias keeps the lines confirmed to it, as the line holds the entry and not a name', () => {
    expect(state([withAliases('Allie')])).toEqual([['confirmed', speaker.id]]);
    expect(state([{ ...withAliases('Ally'), canonical_name: 'Alicia' }])).toEqual([['confirmed', speaker.id]]);
    expect(unattributed([confirmed], [withAliases('Ally')], 'c1')).toBe(0);
  });

  it('a new alias is found in the text, and the name it replaced no longer is', () => {
    const names = (entries: readonly GuideEntity[]) => mentionsIn(entries, 'Allie said Ally was late.').map((m) => m.text);
    expect(names([{ ...withAliases('Ally'), canonical_name: 'Zed' }])).toEqual(['Ally']);
    expect(names([{ ...withAliases('Allie'), canonical_name: 'Zed' }])).toEqual(['Allie']);
    expect(names([{ ...withAliases('Allie', 'Ally'), canonical_name: 'Zed' }])).toEqual(['Allie', 'Ally']);
  });

  it("removing an alias leaves the entry's lines confirmed, and removing the entry drops them back to no speaker", () => {
    expect(state([withAliases()])).toEqual([['confirmed', speaker.id]]);
    expect(state(WIRE_ENTITIES.filter((entry) => entry.id !== speaker.id))).toEqual([['unknown', null]]);
    expect(
      unattributed(
        [confirmed],
        WIRE_ENTITIES.filter((entry) => entry.id !== speaker.id),
        'c1',
      ),
    ).toBe(1);
  });
});

describe('the-words-tab-lists-the-flags-and-the-story-bible-names-in-the-text', () => {
  const alice = { ...entity('alice', 'Alice', 'Character', ['Allie']), pronunciation: { ipa: '/ˈælɪs/', source: 'cmu', confidence: 'set' } };
  const hare = { ...entity('hare', 'March Hare', 'Character'), pronunciation: { ipa: '', source: '', confidence: 'pending' } };
  const flagged: ScriptWord = {
    word: 'knave',
    say: '',
    source: '',
    status: 'not_set',
    flags: [{ id: 'f', chapterId: 'c1', paragraphId: 'p', paragraph: 1, start: 0, end: 5, quote: 'knave', createdAt: '', stale: false }],
  };
  const text = [{ text: 'Alice met the March Hare. Alice saw a knave.' }];

  it("adds each name once, with the entry's pronunciation deciding Set or Not set, after the flagged words", () => {
    expect(chapterWords([flagged], [alice, hare], 'c1', text)).toEqual([
      { word: 'knave', say: '', source: '', status: 'not_set', fromBible: false },
      { word: 'Alice', say: '/ˈælɪs/', source: '', status: 'set', fromBible: true },
      { word: 'March Hare', say: '', source: '', status: 'not_set', fromBible: true },
    ]);
  });
  it('lists a flagged word once even when the Story Bible names it too', () => {
    const both: ScriptWord = { ...flagged, word: 'alice', say: 'AL-iss', source: 'manual', status: 'set' };
    expect(chapterWords([both], [alice], 'c1', text).filter((row) => row.word.toLowerCase() === 'alice')).toHaveLength(1);
  });
  it('lists nothing for a chapter with no flags and no names in its text', () => {
    expect(chapterWords([flagged], [alice], 'c2', [{ text: 'Nothing here.' }])).toEqual([]);
  });
});
