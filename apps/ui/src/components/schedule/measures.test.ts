// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { measOf, measureOptions, measureText, MEASURES } from './measures';

describe('measures', () => {
  it('read as the value the narrator chose, never as an N', () => {
    expect(measureText('checkpoint')).toBe('First 15 finished minutes');
    expect(measureText('min20')).toBe('First 20 finished minutes');
    expect(measureText('ch4')).toBe('First 4 chapters edited and proofed');
    expect(measureText('all')).toBe('Whole book');
    expect(measureText('rec')).toBe('All recorded');
    expect(measureText(undefined)).toBe('Custom');
    for (const stored of ['ch4', 'min20', 'checkpoint', 'all', 'edit', 'custom']) expect(measureText(stored)).not.toMatch(/\bN\b/);
  });

  it('reads a stored measure as its id in the list', () => {
    expect(measOf('ch12')).toBe('chN');
    expect(measOf('min5')).toBe('minN');
    expect(measOf('')).toBe('custom');
    expect(measOf('all')).toBe('all');
  });

  it('offers the checkpoint only where the profile unlocks it', () => {
    const offered = (profile: string, current?: string) => measureOptions(profile, current).map((o) => o.value);
    expect(offered('acx')).toContain('checkpoint');
    expect(offered('none')).not.toContain('checkpoint');
    expect(offered('gone')).not.toContain('checkpoint');
    expect(measureOptions('acx').find((o) => o.value === 'checkpoint')?.label).toBe('15-minute checkpoint');
  });

  it('always includes the measure the milestone already has', () => {
    expect(measureOptions('none', 'checkpoint').map((o) => o.value)).toContain('checkpoint');
    for (const m of MEASURES) expect(measureOptions('none', m.id).map((o) => o.value)).toContain(m.id);
    expect(measureOptions('none', 'ch4').map((o) => o.value)).toContain('chN');
  });

  it('has no "from template" choice', () => {
    expect(MEASURES.some((m) => /template/i.test(m.label))).toBe(false);
  });
});
