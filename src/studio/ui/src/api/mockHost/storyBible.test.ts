import { describe, expect, it } from 'vitest';
import { MOCK_PREVIEW_WAV_BASE64 } from './storyBible';

describe('the mock preview clip', () => {
  // Play preview shows Pause only while the clip plays; a clip of a few milliseconds made the press look like it did nothing (#3339).
  it('is a valid WAV long enough for the button to show it is playing', () => {
    const bytes = Uint8Array.from(atob(MOCK_PREVIEW_WAV_BASE64), (char) => char.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    const seconds = view.getUint32(40, true) / 2 / view.getUint32(24, true);
    expect(seconds).toBeGreaterThanOrEqual(1);
  });
});
