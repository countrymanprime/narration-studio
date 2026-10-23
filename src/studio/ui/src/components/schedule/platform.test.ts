// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { platformHas, platformOf } from './platform';
import { NEUTRAL_PROFILE, PLATFORM_PROFILES } from './profiles';

describe('the delivery profile lookup', () => {
  it('unlocks the checkpoint for ACX and not for "Other / none"', () => {
    expect(platformHas('acx', 'checkpoint15')).toBe(true);
    expect(platformHas('none', 'checkpoint15')).toBe(false);
  });

  it('reads an unknown or missing profile as the neutral one', () => {
    expect(platformOf('gone').id).toBe(NEUTRAL_PROFILE);
    expect(platformOf(undefined).id).toBe(NEUTRAL_PROFILE);
    expect(platformHas('gone', 'checkpoint15')).toBe(false);
  });

  it('reads the capabilities the host reports where it reports them', () => {
    expect(platformHas('none', 'checkpoint15', ['checkpoint15'])).toBe(true);
    expect(platformHas('acx', 'checkpoint15', [])).toBe(false);
  });

  it('keeps the profiles in one table with a neutral entry', () => {
    expect(PLATFORM_PROFILES.map((p) => p.label)).toEqual(['ACX', 'Other / none']);
    expect(PLATFORM_PROFILES.some((p) => p.id === NEUTRAL_PROFILE)).toBe(true);
  });

  it('never names a profile id outside the table (a new platform is a data row)', () => {
    const files = readdirSync(__dirname).filter((f) => /\.tsx?$/.test(f) && !/\.(test|stories)\.tsx?$/.test(f) && f !== 'profiles.ts');
    const named = new RegExp(`['"\`](${PLATFORM_PROFILES.map((p) => p.id).join('|')})['"\`]`);
    for (const file of files) {
      const lines = readFileSync(join(__dirname, file), 'utf8').split('\n');
      // `none` is also a payment type, so it counts only on a line that is about a profile.
      const offending = lines.filter((line) => (line.match(named)?.[1] === NEUTRAL_PROFILE ? /profile/i.test(line) : named.test(line)));
      expect({ file, offending }).toEqual({ file, offending: [] });
    }
  });
});
