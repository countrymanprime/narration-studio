import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../../src/components/settings/registry/categories';
import { ROWS } from '../../src/components/settings/registry/rows';
import { extractAll, HINT_ATTRS, isProse, TEXT_ATTRS } from './prose/extract';
import { PROSE_INVENTORY } from './prose/prose-inventory';

// The design system's "No in-flow instructions" rule (docs/design/design-system.md#no-in-flow-instructions), held over the whole app:
// help text lives in a tooltip, a "?" overlay or the guide, and nothing instructional takes room in a page. The owner found a two-line
// manual under the Editing waveform (#2251); this file makes that a class guard rather than one fix.

/** `instruction` and `explanation` entries in the inventory: drawn in a page's flow, so debt. The number may only go down. */
const MAX_IN_FLOW_INSTRUCTIONS = 32;
/** Settings rows whose always-shown description is longer than one short line (60 characters). The number may only go down. */
const MAX_LONG_SETTING_DESCRIPTIONS = 46;
/** A hover or focus hint is a few words on one line: at most this many characters and one sentence. */
const HINT_MAX = 80;

const hits = extractAll();
const key = (file: string, text: string): string => `${file} | ${text}`;
const tally = (keys: string[]): Map<string, number> => keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>());

describe('prose in the app', () => {
  const found = tally(
    hits
      .filter((h) => (h.kind === 'text' || (TEXT_ATTRS.has(h.kind) && !HINT_ATTRS.has(h.kind))) && !h.srOnly && isProse(h.text))
      .map((h) => key(h.file, h.text)),
  );
  const listed = tally(PROSE_INVENTORY.map((e) => key(e.file, e.text)));

  it('lists every run of prose the app draws in tests/visual/prose/prose-inventory.ts', () => {
    const missing = [...found].filter(([k, n]) => (listed.get(k) ?? 0) < n).map(([k]) => k);
    expect(
      missing,
      'New prose in a page. If it tells the narrator how to use something, put it in a tooltip, a "?" overlay or the guide instead; otherwise add it to the inventory with its class.',
    ).toEqual([]);
  });

  it('lists nothing the app no longer draws', () => {
    const stale = [...listed].filter(([k, n]) => (found.get(k) ?? 0) < n).map(([k]) => k);
    expect(stale, 'Remove these entries from the inventory: the text is gone or changed.').toEqual([]);
  });

  it('does not add in-flow instructions or explanations', () => {
    const debt = PROSE_INVENTORY.filter((e) => e.class === 'instruction' || e.class === 'explanation');
    expect(debt.length).toBeLessThanOrEqual(MAX_IN_FLOW_INSTRUCTIONS);
  });

  it('keeps hints to a few words on one line', () => {
    const long = hits
      .filter((h) => h.kind === 'tooltip' || HINT_ATTRS.has(h.kind))
      .filter((h) => h.text.length > HINT_MAX || /[.!?;]\s+\S/.test(h.text))
      .map((h) => `${h.file}:${h.line} ${h.text}`);
    expect(long).toEqual([]);
  });
});

describe('Settings descriptions', () => {
  it('does not add a description longer than one short line', () => {
    const long = ROWS.filter((row) => (row.desc ?? '').length > 60);
    expect(long.length).toBeLessThanOrEqual(MAX_LONG_SETTING_DESCRIPTIONS);
  });

  it('keeps every category blurb to one line', () => {
    expect(CATEGORIES.filter((c) => c.blurb.length > HINT_MAX).map((c) => c.blurb)).toEqual([]);
  });
});
