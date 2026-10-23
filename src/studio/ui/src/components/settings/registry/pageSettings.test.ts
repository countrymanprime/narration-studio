import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_SETTINGS } from './pageSettings';

const source = (file: string) => readFileSync(join(__dirname, file), 'utf8');

// Owner rule: the Settings page always keeps every setting. A page may add a compact entry of its own (the Booth's Levels menu, Editing's Backups
// tab) that edits the same keys, but it never replaces the Settings control. Two merged pull requests broke this by deleting the Settings copy.
describe('every setting that a page also offers keeps its Settings panel', () => {
  it('gives each Set on a page entry a panel', () => {
    for (const entry of PAGE_SETTINGS) expect(entry.panel, `${entry.id} has no Settings panel`).toBeTruthy();
  });

  it('uses each panel once, and lists every panel the type allows', () => {
    const used = PAGE_SETTINGS.map((entry) => entry.panel);
    expect(new Set(used).size).toBe(used.length);
    const union = /panel: ([^;]+);/.exec(source('pageSettings.ts'))![1]!;
    const allowed = [...union.matchAll(/'([a-z]+)'/g)].map((match) => match[1]);
    expect([...used].sort()).toEqual([...allowed].sort());
  });

  it('draws a panel for every entry in PageSettingPanel', () => {
    const panels = source('../page/PageSettingPanel.tsx');
    for (const entry of PAGE_SETTINGS) expect(panels, `${entry.id}: no case '${entry.panel}'`).toContain(`case '${entry.panel}':`);
  });

  it('keeps the entries the page shortcuts were added for', () => {
    expect(PAGE_SETTINGS.map((entry) => entry.id)).toEqual(expect.arrayContaining(['ps.punch', 'ps.backups']));
  });
});
