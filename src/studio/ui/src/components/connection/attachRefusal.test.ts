import { describe, expect, it } from 'vitest';
import { attachRefusalClaimed, claimAttachRefusal } from './attachRefusal';

describe('attachRefusal', () => {
  it('is claimed while any claim is held, and a release counts once', () => {
    expect(attachRefusalClaimed()).toBe(false);
    const first = claimAttachRefusal();
    const second = claimAttachRefusal();
    first();
    first();
    expect(attachRefusalClaimed()).toBe(true);
    second();
    expect(attachRefusalClaimed()).toBe(false);
  });
});
