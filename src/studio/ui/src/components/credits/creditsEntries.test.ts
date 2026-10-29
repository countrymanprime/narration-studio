import { describe, expect, it } from 'vitest';
import { CREDITS_ID, creditsKindOfId } from './creditsEntries';

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
