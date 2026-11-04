import { describe, expect, it } from 'vitest';
import { DAW_TOOLS, DAW_TOOL_GROUPS, dawToolGate, type DawToolFacts } from './dawTools';

const READY: DawToolFacts = { forAudacity: false, trackCount: 3, chapterCount: 4 };

describe('the DAW tools registry', () => {
  it('lists the tools in the order the Engine panel has always drawn them, each with a unique id and label', () => {
    expect(DAW_TOOLS.map((tool) => tool.label)).toEqual(['Link chapters…', 'Prepare chapter render…', 'Create chapter regions…', 'Cleanup tools…']);
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

  it('says why, for every tool, when the project is Audacity (unsupported, so a page may hide it), in words that name what the tool does', () => {
    for (const tool of DAW_TOOLS) {
      const gate = dawToolGate(tool, { ...READY, forAudacity: true });
      expect(gate).toMatchObject({ level: 'unsupported', available: false });
      expect(gate.message).toMatch(/Audacity/);
    }
    expect(new Set(DAW_TOOLS.map((tool) => dawToolGate(tool, { ...READY, forAudacity: true }).message)).size).toBeGreaterThan(1);
  });

  it('says why, for every tool, when the DAW is not answering, and that comes before the tracks', () => {
    for (const tool of DAW_TOOLS) {
      expect(dawToolGate(tool, { ...READY, trackCount: 0, dawOff: 'REAPER is not connected. Start it from the chip in the top bar.' })).toEqual({
        level: 'not_yet_available',
        available: false,
        message: 'REAPER is not connected. Start it from the chip in the top bar.',
      });
    }
  });

  // QA break B3 of #2820: a write into another project is the risky direction, so the entries are off, with the Booth's own sentence.
  it('turns every tool off, with the sentence the Booth uses, when the DAW has a different project open', () => {
    const wrongProject = 'REAPER has a different project open than the one linked here. Open the linked project in REAPER, or link the open one in Settings.';
    for (const tool of DAW_TOOLS) {
      expect(dawToolGate(tool, { ...READY, trackCount: 0, wrongProject })).toEqual({ level: 'not_yet_available', available: false, message: wrongProject });
    }
  });

  it('says the DAW is not answering before it says another project is open, and Audacity before both', () => {
    const tool = DAW_TOOLS[1];
    expect(dawToolGate(tool, { ...READY, dawOff: 'Not answering.', wrongProject: 'Other project.' }).message).toBe('Not answering.');
    expect(dawToolGate(tool, { ...READY, forAudacity: true, dawOff: 'Not answering.', wrongProject: 'Other project.' }).message).toMatch(/Audacity/);
  });

  it('turns the structure tools off, with their reason, when no chapter is linked to a track', () => {
    const facts = { ...READY, linkedChapterCount: 0 };
    const off = DAW_TOOLS.filter((tool) => !dawToolGate(tool, facts).available);
    expect(off.map((tool) => tool.id)).toEqual(['render-config', 'create-regions']);
    for (const tool of off) expect(dawToolGate(tool, facts).message).toBe('No chapter is linked to a REAPER track yet. Link one on Production.');
  });

  it('does not ask whether a chapter is linked when the caller does not know (the Engine panel, which has the links beside it)', () => {
    for (const tool of DAW_TOOLS) expect(dawToolGate(tool, READY).available).toBe(true);
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
