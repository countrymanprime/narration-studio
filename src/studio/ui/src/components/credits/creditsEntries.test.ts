import { describe, expect, it } from 'vitest';
import { CREDITS_ID, chapterIdOfPrepId, creditsKindOfId } from './creditsEntries';

describe('CREDITS_ID', () => {
  it('names the two credits chapters the host lists', () => {
    expect(CREDITS_ID).toEqual({ opening: 'credits-opening', closing: 'credits-closing' });
  });
});

describe('creditsKindOfId', () => {
  it('names the kind of a credits chapter id, and nothing for a manuscript chapter', () => {
    expect(creditsKindOfId('credits-opening')).toBe('opening');
    expect(creditsKindOfId('credits-closing')).toBe('closing');
    expect(creditsKindOfId('chapter-1')).toBeUndefined();
  });
});

describe('chapterIdOfPrepId', () => {
  it("maps the prep record's credits ids to the chapter ids every list uses, and leaves a chapter's alone", () => {
    expect(chapterIdOfPrepId('credits:opening')).toBe('credits-opening');
    expect(chapterIdOfPrepId('credits:closing')).toBe('credits-closing');
    expect(chapterIdOfPrepId('c-0001')).toBe('c-0001');
  });
});
