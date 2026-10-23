// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './categories';
import { PAGE_SETTINGS } from './pageSettings';
import { reaperPathProblem, ROWS } from './rows';
import { search } from './search';

// config/defaults.json is the host's repo default layer; a row's `def` is what the page compares a value with to decide "Changed".
const DEFAULTS: Record<string, Record<string, string>> = JSON.parse(readFileSync(join(__dirname, '../../../../../../config/defaults.json'), 'utf8'));

describe('the settings registry', () => {
  it('gives every row a unique id and a category that exists', () => {
    const ids = ROWS.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of ROWS) expect(CATEGORIES.map((category) => category.id)).toContain(row.cat);
  });

  it('keeps each host row’s default equal to config/defaults.json', () => {
    for (const row of ROWS.filter((candidate) => candidate.field)) {
      const { tool, key } = row.field!;
      expect(row.def, row.id).toBe(DEFAULTS[tool]?.[key] ?? '');
    }
  });

  it('lists a host field once', () => {
    const fields = ROWS.flatMap((row) => (row.field ? [`${row.field.tool}.${row.field.key}`] : []));
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('has no row for General.log_verbosity, which nothing reads', () => {
    expect(ROWS.some((row) => row.field?.key === 'log_verbosity')).toBe(false);
  });

  it('puts every category in a group and gives each one something to show', () => {
    for (const category of CATEGORIES.filter((candidate) => candidate.id !== 'models'))
      expect(
        ROWS.some((row) => row.cat === category.id),
        category.id,
      ).toBe(true);
  });
});

describe('the Sync activity row', () => {
  it('is an advanced Recording & DAW row for REAPER, found by search', () => {
    const row = ROWS.find((candidate) => candidate.id === 'daw.syncActivity');
    expect(row).toMatchObject({ cat: 'recording', section: 'Chapter sync', advanced: true, needs: 'reaper' });
    expect(search('chapter sync log').some((hit) => hit.row?.id === 'daw.syncActivity')).toBe(true);
  });
});

describe('search', () => {
  it('finds a setting by a word that is not in its name', () => {
    expect(search('whisper').some((hit) => hit.row?.id === 'stt.model')).toBe(true);
  });
  it('needs every word to match', () => {
    expect(search('whisper nothingelse')).toEqual([]);
  });
  it('finds a setting that moved to a page', () => {
    expect(search('breath').some((hit) => hit.page?.id === 'ps.cleanup')).toBe(true);
    expect(PAGE_SETTINGS.length).toBeGreaterThan(0);
  });
  it('leaves out a row the caller hides', () => {
    expect(search('reaper', (row) => !row.needs).some((hit) => hit.row?.needs)).toBe(false);
  });
});

describe('the REAPER program check', () => {
  it('lets an empty value and a full path to reaper through', () => {
    for (const ok of [
      '',
      '  ',
      'C:\\Program Files\\REAPER\\reaper.exe',
      'D:\\Audio\\REAPER (x64)\\REAPER.EXE',
      '/Applications/REAPER.app/Contents/MacOS/REAPER',
      '/opt/REAPER/reaper',
    ]) {
      expect(reaperPathProblem(ok)).toBeUndefined();
    }
  });
  it('refuses anything else in the host’s words, and the row carries the check', () => {
    for (const bad of ['reaper', 'notepad.exe', 'C:\\Program Files\\REAPER\\', 'C:\\reaper.exe.bak', 'REAPER 7']) {
      expect(reaperPathProblem(bad)).toBe('This is not the path to reaper.exe. Use the full path, such as C:\\Program Files\\REAPER\\reaper.exe.');
    }
    expect(ROWS.find((row) => row.id === 'daw.reaperPath')?.check).toBe(reaperPathProblem);
  });
});

describe('the background check rows (#2251)', () => {
  const row = (id: string) => {
    const found = ROWS.find((candidate) => candidate.id === id);
    if (!found) throw new Error(`no row ${id}`);
    return found;
  };

  it('warn about a large model and say nothing about the light pair', () => {
    for (const id of ['stt.backgroundModel', 'stt.backgroundRecheck']) {
      expect(row(id).heavy?.('large-v3-turbo')).toMatch(/much slower/);
      expect(row(id).heavy?.('tiny')).toBeUndefined();
      expect(row(id).heavy?.('small')).toBeUndefined();
    }
    expect(row('stt.backgroundRecheck').heavy?.('none')).toBeUndefined();
  });

  it('warn when the processors asked for pass half the computer', () => {
    const processors = row('stt.backgroundProcessors');
    const cores = navigator.hardwareConcurrency || 4;
    expect(processors.heavy?.('0')).toBeUndefined();
    expect(processors.heavy?.(String(cores))).toMatch(/may slow down/);
  });

  it('default to tiny with small as the double-check', () => {
    expect(row('stt.backgroundModel').def).toBe('tiny');
    expect(row('stt.backgroundRecheck').def).toBe('small');
  });
});
