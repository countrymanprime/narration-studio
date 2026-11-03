import { describe, expect, it } from 'vitest';
import { DAW_TOOLS, DAW_TOOL_GROUPS, dawToolGate, type DawToolFacts } from './dawTools';

const READY: DawToolFacts = { forAudacity: false, trackCount: 3, chapterCount: 4 };

describe('the DAW tools registry', () => {
  it('lists the tools in the order the Engine panel has always drawn them, each with a unique id and label', () => {
    expect(DAW_TOOLS.map((tool) => tool.label)).toEqual([
      'Link chapters…',
      'Prepare chapter render…',
      'Create chapter regions…',
      'Embed chapter tags…',
      'Cleanup tools…',
      'Retakes on lanes…',
    ]);
    expect(new Set(DAW_TOOLS.map((tool) => tool.id)).size).toBe(DAW_TOOLS.length);
  });

  it('puts every tool in a known group, and every group has a tool', () => {
    for (const tool of DAW_TOOLS) expect(DAW_TOOL_GROUPS).toContain(tool.group);
    for (const group of DAW_TOOL_GROUPS) expect(DAW_TOOLS.some((tool) => tool.group === group)).toBe(true);
  });
});

describe('dawToolGate', () => {
  it('is available for every tool when REAPER has tracks and the book has chapters', () => {
    for (const tool of DAW_TOOLS) expect(dawToolGate(tool, READY)).toEqual({ level: 'supported', available: true });
  });

  it('says why, for every tool, when the project is Audacity (unsupported, so a page may hide it)', () => {
    for (const tool of DAW_TOOLS) {
      expect(dawToolGate(tool, { ...READY, forAudacity: true })).toEqual({
        level: 'unsupported',
        available: false,
        message: 'These tools work on a REAPER project; Audacity has none of them.',
      });
    }
  });

  it('says why, for every tool, when the REAPER project has no tracks yet (not yet available, so it stays visible but off)', () => {
    for (const tool of DAW_TOOLS) {
      expect(dawToolGate(tool, { ...READY, trackCount: 0 })).toEqual({
        level: 'not_yet_available',
        available: false,
        message: 'This REAPER project has no tracks yet.',
      });
    }
  });

  it('turns only Link chapters off, with its own reason, when the book has no chapters', () => {
    const facts = { ...READY, chapterCount: 0 };
    const off = DAW_TOOLS.filter((tool) => !dawToolGate(tool, facts).available);
    expect(off.map((tool) => tool.id)).toEqual(['link-chapters']);
    expect(dawToolGate(off[0], facts)).toEqual({ level: 'unsupported', available: false, message: 'This book has no chapters to link yet.' });
  });

  it('checks Audacity before tracks and tracks before chapters, so one reason shows at a time', () => {
    const link = DAW_TOOLS.find((tool) => tool.id === 'link-chapters')!;
    expect(dawToolGate(link, { forAudacity: true, trackCount: 0, chapterCount: 0 }).message).toMatch(/Audacity/);
    expect(dawToolGate(link, { forAudacity: false, trackCount: 0, chapterCount: 0 }).message).toMatch(/no tracks/);
  });
});
