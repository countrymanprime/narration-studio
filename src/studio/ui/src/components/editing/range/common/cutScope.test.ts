import { describe, expect, it } from 'vitest';
import { marksDoc } from '../../script/scriptFixtures';
import { locator } from '../cut/cutFixtures';
import { cutScope } from './locate';

const doc = marksDoc();
const um = doc.items.find((i) => i.kind === 'x')!.key;

describe('the words a cut acts on', () => {
  it('drops a said-only word at either edge and names it', () => {
    expect(cutScope(doc, [um, 'p-1:6', 'p-1:7'], locator)).toMatchObject({ keys: ['p-1:6', 'p-1:7'], stays: [{ key: um }] });
    expect(cutScope(doc, ['p-1:4', 'p-1:5', um], locator)).toMatchObject({ keys: ['p-1:4', 'p-1:5'], stays: [{ key: um }] });
  });

  it('keeps a said-only word between script words', () => {
    expect(cutScope(doc, ['p-1:5', um, 'p-1:6'], locator)).toEqual({ keys: ['p-1:5', um, 'p-1:6'], stays: [] });
  });

  it('leaves a selection of said-only words alone, so it is refused with its own sentence', () => {
    expect(cutScope(doc, [um], locator)).toEqual({ keys: [um], stays: [] });
  });

  it('drops a paragraph that holds nothing but said-only words when another paragraph has script words', () => {
    const twoParagraphs = cutScope(doc, [um, 'p-2:0', 'p-2:1'], locator);
    expect(twoParagraphs.keys).toEqual(['p-2:0', 'p-2:1']);
    expect(twoParagraphs.stays.map((i) => i.key)).toEqual([um]);
  });
});
