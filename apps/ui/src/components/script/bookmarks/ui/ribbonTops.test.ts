// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { bookmark } from './bookmarkFixtures';
import { RIBBON_HEIGHT, measureLineTop, ribbonTops } from './ribbonTops';

const paragraph = document.createElement('p');
// A fake measure: 20 characters to a 30 px line.
const byLine = (_p: HTMLElement, offset: number): number => Math.floor(offset / 20) * 30;

describe('ribbonTops', () => {
  it('puts each ribbon level with the line its offset is on', () => {
    const tops = ribbonTops(paragraph, [bookmark({ id: 'a', offset: 5 }), bookmark({ id: 'b', offset: 45 })], 30, byLine);
    expect(tops).toEqual([0, 60]);
  });

  it('answers in the order given, whatever the offsets', () => {
    const tops = ribbonTops(paragraph, [bookmark({ id: 'late', offset: 45 }), bookmark({ id: 'early', offset: 5 })], 30, byLine);
    expect(tops).toEqual([60, 0]);
  });

  it('stacks several in one line without overlapping', () => {
    const tops = ribbonTops(
      paragraph,
      [1, 2, 3].map((n) => bookmark({ id: `b${n}`, offset: n })),
      18,
      byLine,
    );
    expect(tops).toEqual([0, RIBBON_HEIGHT, RIBBON_HEIGHT * 2]);
  });

  it('steps by the line height when it is taller than a ribbon', () => {
    expect(ribbonTops(paragraph, [bookmark({ offset: 1 }), bookmark({ id: 'x', offset: 2 })], 40, byLine)).toEqual([0, 40]);
  });

  it('answers nothing for no bookmarks', () => {
    expect(ribbonTops(paragraph, [], 30, byLine)).toEqual([]);
  });
});

describe('measureLineTop', () => {
  it('reads the top of the offset against the paragraph, divided by the zoom', () => {
    const p = document.createElement('p');
    p.textContent = 'hello world';
    p.getBoundingClientRect = () => ({ top: 100, height: 60 }) as DOMRect;
    document.createRange = () => ({ setStart() {}, setEnd() {}, getClientRects: () => [{ top: 160 }] }) as unknown as Range;
    expect(measureLineTop(2)(p, 3)).toBe(30);
  });

  it('falls to the bottom line for an offset past the text', () => {
    const p = document.createElement('p');
    p.textContent = 'hi';
    p.getBoundingClientRect = () => ({ top: 0, height: 48 }) as DOMRect;
    expect(measureLineTop()(p, 99)).toBe(40);
  });
});
