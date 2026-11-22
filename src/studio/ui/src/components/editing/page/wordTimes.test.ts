import { describe, expect, it } from 'vitest';
import { wordsCovered } from '../ribbon/rangeMath';
import { itemClocks, type ItemClocks } from '../ribbon/docClock';
import type { ChapterDoc, DocItem } from '../model';
import { docOf, docTimeOf, locatorOf, playlistOf, type ChapterRead } from './chapterSource';
import type { EditCut } from '../../../api/contracts/editCuts';
import { loadRealSpeech, REAL_SPEECH_FILES } from '../model/fixtures/loadRealSpeech';
import { readFrom } from './readFixture';
import { readOf, takeFrom, type Take, type TakeOptions } from './takeFixture';

/**
 * Issue #4047: the words, the waveform and the play all say where a word is. They must say the same thing, and it must be where the word was
 * said. Every check follows one word from the sound in the recording (its seconds in the item's source) to the three places the page uses it:
 * the document clock the words are on, the waveform (`itemClocks`) and the play and the cut (`locatorOf`, `playlistOf`).
 */

const EPS = 0.002;

interface Placed {
  item: DocItem & { t0: number; t1: number };
  /** Where the waveform draws the word's two ends, in seconds of the source. */
  wave: [number, number] | null;
  /** Where a cut or a play of the word's two ends lands, in seconds of the source. */
  cut: [number, number] | null;
}

const audible = (i: DocItem): i is DocItem & { t0: number; t1: number } => i.t0 != null && i.t1 != null && !i.cut && i.st !== 'miss';

function waveSource(clocks: ItemClocks, t: number): number | null {
  const piece = clocks.get(0)?.find((p) => t >= p.from - 1e-9 && t <= p.to + 1e-9);
  return piece ? t - piece.shift : null;
}

function place(doc: ChapterDoc, read: ChapterRead): Placed[] {
  const clocks = itemClocks(doc);
  const loc = locatorOf(doc, read);
  return doc.items.filter(audible).map((item) => {
    const a = waveSource(clocks, item.t0);
    const b = waveSource(clocks, item.t1);
    const c = loc.source(item.t0);
    const d = loc.source(item.t1);
    return { item, wave: a != null && b != null ? [a, b] : null, cut: c && d ? [c.sourceTime, d.sourceTime] : null };
  });
}

const spans = (take: Take): Array<{ text: string; off0: number; off1: number }> => take.said.map((s) => ({ text: s.text, off0: s.off0, off1: s.off1 }));
const at = (list: ReturnType<typeof spans>, off0: number, off1: number) => list.find((s) => Math.abs(s.off0 - off0) < EPS && Math.abs(s.off1 - off1) < EPS);

const SCENARIOS: Array<[string, TakeOptions]> = [
  ['a plain take', {}],
  ['a take whose head was trimmed', { head: 0.3 }],
  ['a late start', { head: 12 }],
  ['a misspoken word and its correction a second later', { fumble: { at: 14, pause: 1.0 } }],
  ['a misspoken word the host paired with the script word and a correction it sent as extra', { fumble: { at: 14, pause: 1.0, misspoken: 'bact' } }],
  ['the same where the correction is the paired word', { fumble: { at: 14, pause: 1.0, misspoken: 'bact', asHeard: 'script-word-second' } }],
  ['a correction right at the start of a line', { fumble: { at: 0, pause: 1.0 } }],
  ['a correction at the end of a paragraph', { fumble: { at: 9, pause: 1.2 } }],
  ['long pauses between lines', { between: 6 }],
  ['a long take', { paragraphs: 12, perParagraph: 60, fumble: { at: 200, pause: 0.9 } }],
];

describe.each(REAL_SPEECH_FILES)('%s', (name) => {
  const real = loadRealSpeech(name);
  describe.each(SCENARIOS)('%s', (_label, opts) => {
    const take = takeFrom(real, opts);
    const read = readOf(take);
    const doc = docOf(read);
    const placed = place(doc, read);
    const truth = spans(take);

    it('puts every word of the recording in the document, in the order it was said', () => {
      const heard = doc.items.filter((i) => i.st !== 'miss' && !i.cut);
      expect(heard.map((i) => i.t0)).toEqual([...heard.map((i) => i.t0)].sort((a, b) => (a as number) - (b as number)));
      expect(heard.length).toBe(take.said.length);
      for (const i of heard) expect(i.t1 as number).toBeGreaterThanOrEqual(i.t0 as number);
    });

    it('draws the waveform where each word was said', () => {
      const off = placed.filter((p) => !p.wave || !at(truth, p.wave[0], p.wave[1]));
      expect(off.map((p) => `${p.item.key} ${p.item.text} ${p.item.t0}-${p.item.t1} wave ${p.wave?.join('-')}`).slice(0, 5)).toEqual([]);
    });

    it('cuts and plays each word where it was said, not early or late', () => {
      const off = placed.filter((p) => !p.cut || !at(truth, p.cut[0], p.cut[1]));
      expect(off.map((p) => `${p.item.key} ${p.item.text} ${p.item.t0}-${p.item.t1} cut ${p.cut?.join('-')}`).slice(0, 5)).toEqual([]);
    });

    it('plays every word to its end: no word reaches past the play of its line', () => {
      const play = playlistOf(doc, { ...read, items: [{ guid: 'item-0', supported: true, sourceAvailable: true, sourceFile: 'f.wav' } as never] });
      const clipped = placed.filter((p) => {
        const seg = play.find((s) => p.item.t0 >= s.elapsedStart - EPS && p.item.t0 < s.elapsedEnd + EPS);
        if (!seg) return true;
        const src = [seg.sourceStart + (p.item.t0 - seg.elapsedStart), seg.sourceStart + (p.item.t1 - seg.elapsedStart)];
        const real = at(truth, src[0], src[1]);
        return !real;
      });
      expect(clipped.map((p) => `${p.item.key} ${p.item.text}`).slice(0, 5)).toEqual([]);
    });

    it('selects exactly the words whose sound lies in a highlighted stretch of the waveform, taken in the source and put on the document by the waveform clock', () => {
      const words = take.said.filter((w) => w.paragraphId !== undefined);
      for (let k = 0; k + 2 < words.length; k += Math.max(1, Math.floor(words.length / 25))) {
        const from = words[k];
        const to = words[k + 2];
        if (from.paragraphId !== to.paragraphId) continue;
        // The stretch is drawn on the source, over the sound of the three words; the clock puts it on the document.
        const start = docTimeOf(doc, read, from.paragraphId as string, from.off0 + 0.005);
        const end = docTimeOf(doc, read, to.paragraphId as string, to.off1 - 0.005);
        expect(start).not.toBeNull();
        const picked = wordsCovered(doc.items, { start: start as number, end: end as number }).keys;
        const lying = doc.items.filter((i) => i.src && !i.cut && i.src.start >= from.off0 - EPS && i.src.start <= to.off0 + EPS).map((i) => i.key);
        expect(picked).toEqual(lying);
      }
    });
  });
});

describe('a word said twice in a row, through the page (issue #4047)', () => {
  for (const name of REAL_SPEECH_FILES) {
    it(`${name}: the correction is the script word and the misspoken attempt is the extra word`, () => {
      const take = takeFrom(loadRealSpeech(name), { fumble: { at: 14, pause: 1.0 } });
      const doc = docOf(readOf(take));
      const first = take.said.findIndex((s, k) => s.paragraphId !== undefined && take.said[k + 1]?.added);
      const attempt = take.said[first];
      const correction = take.said[first + 1];
      const script = doc.items.find((i) => i.key === `${attempt.paragraphId}:${attempt.ordinal}`);
      expect(script?.st).toBe('ok');
      expect(script?.src?.start).toBeCloseTo(correction.off0, 3);
      const flagged = doc.items.filter((i) => i.st === 'extra');
      expect(flagged).toHaveLength(1);
      expect(flagged[0].src?.start).toBeCloseTo(attempt.off0, 3);
    });
  }
});

describe('a word misspoken at the start of a line and said again (issue #4047)', () => {
  const heard = [
    { text: 'we', paragraphId: 'p-1', ordinal: 0, item: 0, off0: 1, off1: 1.3, conf: 1 },
    { text: 'home', paragraphId: 'p-1', ordinal: 1, item: 0, off0: 1.3, off1: 2, conf: 1 },
    { text: 'go', item: 0, off0: 6, off1: 6.3, conf: 1, added: true as const },
    { text: 'go', paragraphId: 'p-2', ordinal: 0, item: 0, off0: 7.5, off1: 7.8, conf: 1 },
    { text: 'now', paragraphId: 'p-2', ordinal: 1, item: 0, off0: 7.8, off1: 8.2, conf: 1 },
  ];
  const paragraphs = [
    { id: 'p-1', text: 'we home' },
    { id: 'p-2', text: 'go now' },
  ];
  const read = readFrom(paragraphs, heard);
  const doc = docOf(read);

  it('files the misspoken copy with the line it was said for, not the end of the line before', () => {
    expect(doc.items.find((i) => i.st === 'extra')?.pid).toBe('p-2');
    expect(doc.paras[0].end).toBeCloseTo(doc.paras[0].items[1].t1 as number, 3);
  });

  it('plays nothing of the silence between the two lines as part of the first', () => {
    const play = playlistOf(doc, { ...read, items: [{ guid: 'item-0', supported: true, sourceAvailable: true, sourceFile: 'f.wav' } as never] });
    expect(Math.max(...play.filter((s) => s.sourceStart < 3).map((s) => s.sourceEnd))).toBeLessThanOrEqual(2.001);
  });
});

describe('a cut word is not played (issue #4047)', () => {
  it.each(['close', 'gap'] as const)('plays no second of a cut misspoken copy (%s)', (mode) => {
    const take = takeFrom(loadRealSpeech('alice-ch1-librivox'), { fumble: { at: 14, pause: 0.4, misspoken: 'bact', asHeard: 'script-word-second' } });
    const read = readOf(take);
    const base = docOf(read);
    const extra = base.items.find((i) => i.st === 'extra')!;
    const cut: EditCut = {
      id: 'cut-1',
      chapterId: 'c-1',
      a: extra.t0 as number,
      b: extra.t1 as number,
      mode,
      keys: [extra.key],
      words: [extra.text],
      off0: extra.off0 as number,
      off1: extra.off1 as number,
      at: '2026-11-22T00:00:00Z',
      paragraph: null,
      stale: false,
      pid: extra.pid,
      text: extra.text,
      fadeMs: 0,
      daw: 'reaper',
      guid: 'cut-guid',
      undoSteps: 1,
    };
    const doc = docOf({ ...read, cuts: [cut] });
    const withCut = { ...read, cuts: [cut] };
    const play = playlistOf(doc, { ...withCut, items: [{ guid: 'item-0', supported: true, sourceAvailable: true, sourceFile: 'f.wav' } as never] });
    const word = take.said.find((s) => s.added)!;
    const overlap = play.filter((s) => Math.min(s.sourceEnd, word.off1) - Math.max(s.sourceStart, word.off0) > 0.01);
    expect(overlap).toEqual([]);
  });
});

const editCut = (doc: ChapterDoc, keys: string[], mode: 'close' | 'gap'): EditCut => {
  const items = keys.map((k) => doc.items[doc.index.get(k) as number]);
  return {
    id: 'cut-1',
    chapterId: 'c-1',
    a: items[0].t0 as number,
    b: items[items.length - 1].t1 as number,
    mode,
    keys,
    words: items.map((i) => i.text),
    off0: items[0].off0 as number,
    off1: items[items.length - 1].off1 as number,
    at: '2026-11-22T00:00:00Z',
    paragraph: null,
    stale: false,
    pid: items[0].pid,
    text: items.map((i) => i.text).join(' '),
    fadeMs: 0,
    daw: 'reaper',
    guid: 'cut-guid',
    undoSteps: 1,
  };
};

describe('a closed cut inside a line (issue #4047)', () => {
  const take = takeFrom(loadRealSpeech('alice-ch1-librivox'), { paragraphs: 1, perParagraph: 10 });
  const read = readOf(take);
  const plain = docOf(read);
  const cutRead = { ...read, cuts: [editCut(plain, [plain.items[2].key, plain.items[3].key], 'close')] };
  const doc = docOf(cutRead);
  const loc = locatorOf(doc, cutRead);
  const kept = doc.items.filter((i) => !i.cut);

  it('puts every word that is left at the second it was said, at its start and its end, for a cut, an effect and a replace', () => {
    const truth = new Map(take.said.map((w) => [`${w.paragraphId}:${w.ordinal}`, w]));
    for (const i of kept) {
      const said = truth.get(i.key) as NonNullable<ReturnType<typeof truth.get>>;
      expect(loc.source(i.t0 as number)?.sourceTime, `${i.text} start`).toBeCloseTo(said.off0, 2);
      expect(loc.source((i.t1 as number) - 0.001)?.sourceTime, `${i.text} end`).toBeCloseTo(said.off1 - 0.001, 2);
    }
  });

  it('puts a moment in the pause after the cut on the audio of the pause, not on the cut', () => {
    const before = kept[1];
    const after = kept[2];
    const mid = ((before.t1 as number) + (after.t0 as number)) / 2;
    expect(loc.source(mid)?.sourceTime).toBeGreaterThanOrEqual(take.said[1].off1 - 0.01);
  });

  it('puts the split of a line said twice on the same clock', () => {
    const second = doc.paras[0].items[5];
    const src = take.said[5].off0;
    expect(docTimeOf(doc, cutRead, 'p-001', src)).toBeCloseTo(second.t0 as number, 2);
  });
});

describe('a line recorded across two items (issue #4047)', () => {
  const heard = ['one', 'two', 'three', 'four', 'five'].map((text, k) => ({
    text,
    paragraphId: 'p-1',
    ordinal: k,
    item: k < 3 ? 0 : 1,
    off0: k < 3 ? 2 + k * 0.5 : 40 + (k - 3) * 0.5,
    off1: k < 3 ? 2.4 + k * 0.5 : 40.4 + (k - 3) * 0.5,
    conf: 1,
  }));
  const read = readFrom([{ id: 'p-1', text: 'one two three four five' }], heard, {
    items: [
      { index: 0, itemGuid: 'item-0', live: true },
      { index: 1, itemGuid: 'item-1', live: true },
    ],
  });
  const doc = docOf(read);

  it('cuts every word in its own item, at its own second', () => {
    const loc = locatorOf(doc, read);
    for (const [k, i] of doc.items.entries()) {
      const at = loc.source(i.t0 as number);
      expect(at?.itemGuid, i.text).toBe(k < 3 ? 'item-0' : 'item-1');
      expect(at?.sourceTime, i.text).toBeCloseTo(heard[k].off0, 2);
    }
  });

  it('plays every word from its own item', () => {
    const files = [
      { guid: 'item-0', supported: true, sourceAvailable: true, sourceFile: 'a.wav' },
      { guid: 'item-1', supported: true, sourceAvailable: true, sourceFile: 'b.wav' },
    ] as never;
    const play = playlistOf(doc, { ...read, items: files });
    expect(play.map((s) => [s.sourceFile, Math.round(s.sourceStart * 100) / 100, Math.round(s.sourceEnd * 100) / 100])).toEqual([
      ['a.wav', 2, 3.4],
      ['b.wav', 40, 40.9],
    ]);
  });
});

describe('added words straight before the first word of a line (issue #4047)', () => {
  const lines = [
    { id: 'p-1', text: 'we home' },
    { id: 'p-2', text: 'go now please thanks' },
  ];
  const at = (text: string, off0: number, paragraphId?: string, ordinal?: number) => ({
    text,
    ...(paragraphId ? { paragraphId, ordinal } : { added: true as const }),
    item: 0,
    off0,
    off1: off0 + 0.3,
    conf: 1,
  });

  it('moves the whole run, "go um", with the line it starts, in the order it was said', () => {
    const read = readFrom(lines, [
      at('we', 1, 'p-1', 0),
      at('home', 1.4, 'p-1', 1),
      at('go', 6),
      at('um', 6.5),
      at('go', 7.5, 'p-2', 0),
      at('now', 8, 'p-2', 1),
      at('please', 8.4, 'p-2', 2),
      at('thanks', 8.8, 'p-2', 3),
    ]);
    const doc = docOf(read);
    expect(doc.items.filter((i) => i.pid === 'p-2' && i.kind === 'x').map((i) => i.text)).toEqual(['go', 'um']);
    expect(doc.items.filter((i) => i.pid === 'p-1').map((i) => i.text)).toEqual(['we', 'home']);
    const files = [{ guid: 'item-0', supported: true, sourceAvailable: true, sourceFile: 'f.wav' }] as never;
    const play = playlistOf(doc, { ...read, items: files });
    // No second of the source plays twice.
    const sorted = [...play].sort((a, b) => a.sourceStart - b.sourceStart);
    sorted.slice(1).forEach((s, k) => expect(s.sourceStart).toBeGreaterThanOrEqual(sorted[k].sourceEnd - 1e-6));
  });

  it('leaves an aside said right after the last word of a line with that line, however far the next one is', () => {
    const read = readFrom(lines, [
      at('we', 1, 'p-1', 0),
      at('home', 1.4, 'p-1', 1),
      at('go', 1.8),
      at('go', 7.5, 'p-2', 0),
      at('now', 8, 'p-2', 1),
      at('please', 8.4, 'p-2', 2),
      at('thanks', 8.8, 'p-2', 3),
    ]);
    const doc = docOf(read);
    expect(doc.items.find((i) => i.kind === 'x')?.pid).toBe('p-1');
  });
});
