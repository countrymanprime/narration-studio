import { describe, expect, it } from 'vitest';
import type { ManuscriptChapter } from '../../../types';
import { chapterStates, readinessCounts } from '../../delivery/page/chapterStates';
import { packageCounts } from './packageItems';

const chapter = (index: number): ManuscriptChapter => ({ id: `c${index}`, title: `Chapter ${index}`, index }) as ManuscriptChapter;
const credits = (kind: 'opening' | 'closing'): ManuscriptChapter =>
  ({ id: `credits-${kind}`, title: `${kind === 'opening' ? 'Opening' : 'Closing'} credits`, index: -2, isCredits: true }) as ManuscriptChapter;

describe('the package card counts what Delivery counts', () => {
  const chapters = [credits('opening'), chapter(1), chapter(2), chapter(3), credits('closing')];

  it('counts the credits chapters as not ready beside the others, with nothing measured', () => {
    expect(packageCounts(chapters, []).notReady).toBe(5);
    expect(packageCounts(chapters.slice(1, 4), []).notReady).toBe(3);
  });

  it('gives the number Delivery gives for the same chapters and files', () => {
    expect(packageCounts(chapters, []).notReady).toBe(readinessCounts(chapterStates(chapters, [])).wait);
  });
});
