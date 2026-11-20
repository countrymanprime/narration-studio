import { describe, expect, it } from 'vitest';
import { linkFailureSentence } from './linkFailure';

describe('linkFailureSentence', () => {
  it('says each failed write in one fixed form, with the host’s reason after it', () => {
    const reason = new Error('the bridge timed out');
    expect(linkFailureSentence('set', reason)).toBe('The link could not be made: the bridge timed out');
    expect(linkFailureSentence('unlink', reason)).toBe('The link could not be removed: the bridge timed out');
    expect(linkFailureSentence('create', reason)).toBe('The track could not be added: the bridge timed out');
  });
  it('names a folder in a Voice folders project', () => {
    expect(linkFailureSentence('create', new Error('x'), 'folder')).toBe('The folder could not be added: x');
  });
  it('tells a change that was made but not read again as that, not as a failure', () => {
    expect(linkFailureSentence('unread', new Error('x'))).toContain('The change was made, but the list could not be read again');
  });
  it('clips and cleans a host reason that is huge or holds control characters', () => {
    const text = linkFailureSentence('set', new Error(`bad\u0007\u0000 ${'x'.repeat(100_000)}`));
    expect(text.length).toBeLessThan(260);
    expect(Array.from(text).some((ch) => (ch.codePointAt(0) ?? 0) < 0x20)).toBe(false);
  });
  it('drops an empty or non-text reason, leaving a complete sentence', () => {
    for (const reason of ['', new Error(''), {}, undefined, null]) expect(linkFailureSentence('set', reason)).toBe('The link could not be made.');
  });
});
