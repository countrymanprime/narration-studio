import { describe, expect, it } from 'vitest';
import type { ManuscriptChapter } from '../../../../api/contracts/manuscript';
import { deepLinkTarget, isDeepLinkShaped } from './useDeepLink';

const chapter = (id: string, title: string, paragraphs: Array<[string, number]>, contentKind?: ManuscriptChapter['contentKind']): ManuscriptChapter =>
  ({ id, title, contentKind, paragraphIds: paragraphs.map(([pid, index]) => ({ id: pid, index })) }) as ManuscriptChapter;

const CHAPTERS = [
  chapter('c1', 'Down the Rabbit-Hole', [
    ['p-a', 0],
    ['p-b', 1],
  ]),
  chapter('c2', 'The Pool of Tears', [['p-c', 2]]),
  chapter('ref', 'Glossary', [['p-g', 3]], 'reference'),
];

describe('deep-links-land-on-the-new-page', () => {
  it('#p<index> is the paragraph with that book-wide index, in its chapter', () => {
    expect(deepLinkTarget('#p2', CHAPTERS)).toEqual({ chapterId: 'c2', paragraphId: 'p-c' });
  });

  it('#c<chapter> is the chapter by id, or else by title', () => {
    expect(deepLinkTarget('#cc1', CHAPTERS)).toEqual({ chapterId: 'c1' });
    expect(deepLinkTarget(`#c${encodeURIComponent('The Pool of Tears')}`, CHAPTERS)).toEqual({ chapterId: 'c2' });
  });

  it('a reference chapter is not shown in the reader, so its link says so instead', () => {
    expect(deepLinkTarget('#p3', CHAPTERS)).toBe('reference');
    expect(deepLinkTarget('#cref', CHAPTERS)).toBe('reference');
  });

  it('the credits links, an unknown paragraph and any other hash are not deep links here', () => {
    expect(deepLinkTarget('#credits-opening', CHAPTERS)).toBeNull();
    expect(deepLinkTarget('#p99', CHAPTERS)).toBeNull();
    expect(deepLinkTarget('#pfive', CHAPTERS)).toBeNull();
    expect(deepLinkTarget('#x-not-a-deep-link', CHAPTERS)).toBeNull();
  });
});

describe('a malformed or stale link', () => {
  it('a malformed escape names nothing instead of throwing', () => {
    expect(deepLinkTarget('#c%', CHAPTERS)).toBeNull();
    expect(deepLinkTarget('#c%E0%A4%A', CHAPTERS)).toBeNull();
  });

  it('knows which hashes are shaped like a chapter or line link', () => {
    for (const hash of ['#p12', '#cc1', '#c%', '#cgone']) expect(isDeepLinkShaped(hash)).toBe(true);
    for (const hash of ['', '#', '#credits-opening', '#x', '#pfive', '#p-1']) expect(isDeepLinkShaped(hash)).toBe(false);
  });
});
