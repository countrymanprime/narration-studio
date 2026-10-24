// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Mark, MarkType } from '../../../api/contracts/marks';
import type { GuideDialogueCue, GuideEntity } from '../../../api/contracts/storyBible';
import type { GuideType } from '../../../types';
import { EditingPageProvider } from './EditingPageState';
import { docFromHeard, unitsOf } from './docFromHeard';
import { ScriptNotesProvider } from './paragraphNotes';
import { ScriptDoc } from './ScriptDoc';

afterEach(cleanup);

const TEXT = 'Alice said, “Hello there,” and sat in the garden.';
const QUOTE = { start: TEXT.indexOf('“'), end: TEXT.indexOf('”') + 1 };

const entry = (id: string, name: string, category: string): GuideEntity => ({ id, canonical_name: name, category, aliases: [] }) as unknown as GuideEntity;
const TYPES: GuideType[] = [
  { name: 'Character', colour: 'green', speaks: true },
  { name: 'Place', colour: 'blue', speaks: false },
];
const ENTRIES = [entry('e1', 'Alice', 'Character'), entry('e2', 'garden', 'Place'), entry('e3', 'Wren', 'Needs Review')];
const cue = (source: GuideDialogueCue['speaker_source'], speaker: string | null): GuideDialogueCue => ({
  id: 'c1',
  chapterId: '5',
  paragraphId: 'p-1',
  quote_start: QUOTE.start,
  quote_end: QUOTE.end,
  quote_text: TEXT.slice(QUOTE.start, QUOTE.end),
  speaker_entity_id: speaker,
  speaker_source: source,
  evidence: { chapterId: '5', paragraphId: 'p-1', excerpt: '', tag: '' },
  corrected: source === 'correction',
});
const TYPE: MarkType = { key: 'stress', name: 'Word stress', colour: 'copper', style: 'underline', asks: false };
const mark = (over: Partial<Mark> = {}): Mark => ({
  id: 'm1',
  chapterId: '5',
  paragraphId: 'p-1',
  paragraph: 0,
  start: TEXT.indexOf('Hello'),
  end: TEXT.indexOf('Hello') + 5,
  quote: 'Hello',
  type: 'stress',
  text: 'Lean on this',
  thread: [],
  createdAt: '',
  stale: false,
  ...over,
});

function show(cues: GuideDialogueCue[], marks: Mark[] = [mark()]) {
  const doc = docFromHeard([{ id: 'p-1', text: TEXT, phrases: cues.map((c) => ({ cue: c.id, start: c.quote_start, end: c.quote_end })) }], {
    heard: null,
    reason: 'x',
    reasons: [],
  });
  render(
    <EditingPageProvider doc={doc}>
      <ScriptNotesProvider sources={{ marks, markTypes: [TYPE], words: [], entries: ENTRIES, cues, types: TYPES }} chapterId="5">
        <ScriptDoc />
      </ScriptNotesProvider>
    </EditingPageProvider>,
  );
  return doc;
}
const word = (key: string) => document.querySelector<HTMLElement>(`[data-k="${key}"]`)!;

describe('units follow the quotes', () => {
  it('splits a paragraph into narration, the quote and narration, and keeps the word numbers it has without quotes', () => {
    const phrases = [{ cue: 'c1', start: QUOTE.start, end: QUOTE.end }];
    const units = unitsOf({ id: 'p-1', text: TEXT, phrases });
    expect(units.map((u) => [TEXT.slice(u.s, u.e), u.cue])).toEqual([
      ['Alice said, ', undefined],
      ['“Hello there,”', 'c1'],
      [' and sat in the garden.', undefined],
    ]);
    const plain = docFromHeard([{ id: 'p-1', text: TEXT }], { heard: null, reason: 'x', reasons: [] });
    const quoted = docFromHeard([{ id: 'p-1', text: TEXT, phrases }], { heard: null, reason: 'x', reasons: [] });
    expect(quoted.items.map((i) => [i.key, i.text])).toEqual(plain.items.map((i) => [i.key, i.text]));
  });
  it('moves a boundary out to the whitespace so a word is never split', () => {
    const text = 'He said“Hello there”and left.';
    const units = unitsOf({ id: 'p', text, phrases: [{ cue: 'c', start: text.indexOf('“'), end: text.indexOf('”') + 1 }] });
    expect(units.map((u) => text.slice(u.s, u.e))).toEqual(['He ', 'said“Hello there”and', ' left.']);
    expect(units.map((u) => u.cue)).toEqual([undefined, 'c', undefined]);
  });
  it('ignores a phrase outside the text, an empty one and one inside another', () => {
    const units = unitsOf({
      id: 'p',
      text: 'One two three.',
      phrases: [
        { cue: 'a', start: 40, end: 50 },
        { cue: 'b', start: 4, end: 4 },
        { cue: 'c', start: 0, end: 7 },
        { cue: 'd', start: 2, end: 6 },
      ],
    });
    expect(units.filter((u) => u.cue).map((u) => u.cue)).toEqual(['c']);
  });
});

describe('the script carries the Story Bible and the narrator’s marks', () => {
  it('puts the speaker’s chip before the quote, in the speaker’s state', () => {
    show([cue('correction', 'e1')]);
    const chip = document.querySelector('[data-spk="c1"]')!;
    expect(chip.getAttribute('data-state')).toBe('confirmed');
    expect(chip.textContent).toBe('Alice');
    expect(chip.getAttribute('aria-label')).toBe('Speaker: Alice, confirmed');
    expect(chip.compareDocumentPosition(word('p-1:2')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chip.compareDocumentPosition(word('p-1:1')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
  it('draws a suggested speaker and an unknown one differently from a confirmed one', () => {
    const { unmount } = render(<span />);
    unmount();
    show([cue('tag', 'e1')]);
    expect(document.querySelector('[data-spk="c1"]')?.getAttribute('data-state')).toBe('suggested');
    cleanup();
    show([cue('unknown', null)]);
    expect(document.querySelector('[data-spk="c1"]')?.getAttribute('data-state')).toBe('unknown');
    expect(document.querySelector('[data-spk="c1"]')?.textContent).toBe('?');
  });
  it('follows the chip rule Script and the Booth draw by: dashed until confirmed, nobody for a place', () => {
    const state = (source: GuideDialogueCue['speaker_source'], speaker: string) => {
      show([cue(source, speaker)]);
      const chip = document.querySelector('[data-spk="c1"]');
      const found = [chip?.getAttribute('data-state'), chip?.textContent];
      cleanup();
      return found;
    };
    expect(state('proximity', 'e1')).toEqual(['suggested', 'Alice']);
    expect(state('tag', 'e3')).toEqual(['suggested', 'Wren']);
    expect(state('correction', 'e3')).toEqual(['confirmed', 'Wren']);
    expect(state('tag', 'e2')).toEqual(['unknown', '?']);
  });
  it('marks the words of a Story Bible name with the entry’s colour and not the words around them', () => {
    show([cue('correction', 'e1')]);
    expect(word('p-1:0').hasAttribute('data-entity')).toBe(true);
    expect(word('p-1:0').getAttribute('aria-description')).toBe('Story Bible name');
    expect(word('p-1:0').style.boxShadow).toContain('var(--character)');
    expect(word('p-1:8').hasAttribute('data-entity')).toBe(true);
    expect(word('p-1:8').style.boxShadow).toContain('var(--place)');
    expect(word('p-1:1').hasAttribute('data-entity')).toBe(false);
  });
  it('marks the words the narrator marked in the type’s colour and style, and names the type', () => {
    show([cue('correction', 'e1')]);
    const hello = word('p-1:2');
    expect(hello.hasAttribute('data-noted')).toBe(true);
    expect(hello.style.textDecorationColor).toBe('var(--accent)');
    expect(hello.getAttribute('aria-description')).toBe('Marked: Word stress');
    expect(word('p-1:3').hasAttribute('data-noted')).toBe(false);
  });
  it('shows a mark’s note under its line as name: text, and nothing for a mark with no text or a stale one', () => {
    show([cue('correction', 'e1')]);
    expect(screen.getByText('Word stress:').parentElement?.textContent).toBe('Word stress: Lean on this');
    cleanup();
    show([cue('correction', 'e1')], [mark({ text: '' }), mark({ id: 'm2', text: 'old', stale: true })]);
    expect(document.querySelector('[data-note]')).toBeNull();
  });
  it('draws a plain script when no provider is mounted', () => {
    const doc = docFromHeard([{ id: 'p-1', text: TEXT }], { heard: null, reason: 'x', reasons: [] });
    render(
      <EditingPageProvider doc={doc}>
        <ScriptDoc />
      </EditingPageProvider>,
    );
    expect(document.querySelector('[data-spk],[data-entity],[data-noted],[data-note]')).toBeNull();
  });
});
