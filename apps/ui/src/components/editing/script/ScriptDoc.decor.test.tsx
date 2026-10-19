// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChapterDoc } from '../model';
import { EditingPageProvider } from './EditingPageState';
import { docFromHeard, type ScriptDecor } from './docFromHeard';
import { ScriptDoc } from './ScriptDoc';
import { notTranscribed } from './scriptFixtures';

afterEach(cleanup);

const TEXT = '“Come here,” said Alice. The garden was quiet. “Not yet.”';
const at = (s: string) => TEXT.indexOf(s);

const decor = (extra: Partial<ScriptDecor> = {}): ScriptDecor => ({
  phrases: new Map([
    [
      'p-1',
      [
        { start: at('“Come'), end: at('said'), speaker: 'Alice', confirmed: true },
        { start: at('“Not'), end: TEXT.length, speaker: '?', confirmed: false },
      ],
    ],
  ]),
  decorations: [
    {
      paragraphId: 'p-1',
      kind: 'entity',
      start: at('Alice'),
      end: at('Alice') + 5,
      colour: { hue: 'character', line: '--character', text: '--character-text' },
      title: 'Alice',
    },
    { paragraphId: 'p-1', kind: 'mark', start: at('garden'), end: at('garden') + 6, colour: 'warn', style: 'dotted', title: 'Check' },
  ],
  notes: [{ id: 'm1', paragraphId: 'p-1', name: 'Check', text: 'Is it a garden or a yard?', colour: 'warn' }],
  ...extra,
});

const build = (d?: ScriptDecor): ChapterDoc => docFromHeard([{ id: 'p-1', text: TEXT }], notTranscribed(), d ? { decor: d } : {});
const show = (doc: ChapterDoc) =>
  render(
    <EditingPageProvider doc={doc}>
      <ScriptDoc />
    </EditingPageProvider>,
  );

describe('the speaker chip before a quotation', () => {
  it('cuts the line at each quotation and keeps every word, in order, under the same keys', () => {
    const plain = build();
    const cut = build(decor());
    expect(plain.paras[0].units).toHaveLength(1);
    expect(cut.paras[0].units.map((u) => !!u.u.q)).toEqual([true, false, true]);
    expect(cut.items.map((i) => i.key)).toEqual(plain.items.map((i) => i.key));
    expect(cut.items.map((i) => i.text)).toEqual(plain.items.map((i) => i.text));
  });
  it('draws the name solid when confirmed, dashed when only suggested, and "?" for a quote nobody speaks', () => {
    show(build(decor()));
    const chips = [...document.querySelectorAll<HTMLElement>('[data-speaker-chip]')];
    expect(chips.map((c) => c.textContent)).toEqual(['Alice', '?']);
    expect(chips[0].dataset.suggested).toBeUndefined();
    expect(chips[1].dataset.suggested).toBe('');
    expect(document.querySelector('[data-speaker-chip]')?.nextSibling?.textContent).not.toBe('Alice');
  });
  it('draws no chip for a line with no quotation, or when the cues are not known', () => {
    show(build());
    expect(document.querySelector('[data-speaker-chip]')).toBeNull();
  });
  it('leaves out a cue that lies outside the text or overlaps the one before it', () => {
    const bad = decor({
      phrases: new Map([
        [
          'p-1',
          [
            { start: 0, end: at('said'), speaker: 'Alice', confirmed: true },
            { start: 5, end: 20, speaker: 'Bob', confirmed: true },
            { start: 10, end: TEXT.length + 50, speaker: 'Cy', confirmed: true },
          ],
        ],
      ]),
    });
    const doc = build(bad);
    expect(doc.paras[0].units.filter((u) => u.u.q).map((u) => u.u.spk)).toEqual(['Alice']);
    expect(doc.items.map((i) => i.text).join(' ')).toBe(TEXT.split(/\s+/).join(' '));
  });
});

describe('Story Bible names and marked words', () => {
  it('underlines a name in the entry colour and a marked word in its type style, and names them for the pointer', () => {
    show(build(decor()));
    const alice = document.querySelector<HTMLElement>('[data-k="p-1:3"]')!;
    expect(alice.textContent).toBe('Alice.');
    expect(alice.getAttribute('style')).toMatch(/--character/);
    expect(alice.title).toBe('Alice');
    const garden = document.querySelector<HTMLElement>('[data-k="p-1:5"]')!;
    expect(garden.textContent).toBe('garden');
    expect(garden.style.textDecorationStyle).toBe('dotted');
    expect(garden.title).toBe('Check');
  });
  it('marks nothing on a word with neither', () => {
    show(build(decor()));
    expect(document.querySelector<HTMLElement>('[data-k="p-1:6"]')!.getAttribute('style')).toBeNull();
  });
});

describe("a line's Booth notes", () => {
  it('shows "name: text" under the line', () => {
    show(build(decor()));
    const note = document.querySelector<HTMLElement>('[data-ann="m1"]')!;
    expect(note.textContent).toBe('Check: Is it a garden or a yard?');
    expect(note.closest('[data-pid]')?.contains(note)).toBe(true);
  });
  it('shows none for a line without', () => {
    show(build());
    expect(document.querySelector('[data-ann]')).toBeNull();
  });
});
