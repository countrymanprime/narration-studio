import { describe, expect, it } from 'vitest';
import type { ManuscriptChapter } from '../../../types';
import type { CreditsEntry } from '../../credits/creditsEntries';
import { chapterStates, listedChapters, readinessCounts } from '../../delivery/page/chapterStates';
import { packageCounts } from './packageItems';

const chapter = (index: number): ManuscriptChapter => ({ id: `c${index}`, title: `Chapter ${index}`, index }) as ManuscriptChapter;
const entry = (kind: 'opening' | 'closing'): CreditsEntry =>
  ({ kind, id: `credits-${kind}`, name: `${kind} credits`, prep: 'none', status: 'not_started', words: 3 }) as CreditsEntry;

describe('the package card counts what Delivery counts', () => {
  const chapters = [chapter(1), chapter(2), chapter(3)];
  const credits = { opening: entry('opening'), closing: entry('closing') };

  it('counts the credits files as not ready beside the chapters, with nothing measured', () => {
    expect(packageCounts(chapters, credits, []).notReady).toBe(5);
    expect(packageCounts(chapters, {}, []).notReady).toBe(3);
  });

  it('gives the number Delivery gives for the same chapters, credits and files', () => {
    const delivery = readinessCounts(chapterStates(listedChapters(chapters, credits), []));
    expect(packageCounts(chapters, credits, []).notReady).toBe(delivery.wait);
  });
});
