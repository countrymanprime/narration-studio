import { describe, expect, it } from 'vitest';
import { DAW_CAPABILITIES } from '../api/contracts/daw';
import { CAPABILITY_GUIDE } from './capabilityGuide';
import { CAPABILITY_MATRIX } from './capabilityMatrix';

describe('the capability guide', () => {
  it('explains every catalogue capability, in a sentence', () => {
    expect(Object.keys(CAPABILITY_GUIDE)).toEqual(DAW_CAPABILITIES.map(({ key }) => key));
    for (const { key } of DAW_CAPABILITIES) {
      expect(CAPABILITY_GUIDE[key].does.length, key).toBeGreaterThan(20);
      expect(CAPABILITY_GUIDE[key].does.endsWith('.'), key).toBe(true);
      expect(CAPABILITY_MATRIX[key], key).toHaveLength(4);
    }
  });

  it('never words a level as Experimental', () => {
    expect(JSON.stringify(CAPABILITY_GUIDE)).not.toMatch(/experimental/i);
  });
});
