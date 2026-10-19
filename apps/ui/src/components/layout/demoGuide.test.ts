import { describe, expect, it } from 'vitest';
import { guideForPath, guideHref } from './demoGuide';

describe('guideForPath', () => {
  it('maps each demo page to the guide that explains it', () => {
    expect(guideForPath('/')).toBe('production');
    expect(guideForPath('/proof/chapter-3?note=2')).toBe('proof');
    expect(guideForPath('#/editing')).toBe('editing');
    expect(guideForPath('/companion')).toBe('booth');
    expect(guideForPath('/master#file=a.wav')).toBe('master-and-qc');
    expect(guideForPath('/story-bible')).toBe('story-bible');
  });

  it('falls back to the guide index for a path no guide covers', () => {
    expect(guideForPath('/nowhere')).toBe('index');
  });

  it('addresses the guide from the demo page', () => {
    expect(guideHref('/pickups')).toBe('../docs/pickups.html');
  });
});
