// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ROWS } from '../registry/rows';
import { BROWSER_CHANGED } from './browserValues';
import { isBrowserChanged } from './values';

afterEach(() => localStorage.clear());

const browserRows = () => ROWS.filter((row) => row.scope === 'browser');

describe('browser rows and the Changed filter', () => {
  // The guard for the class of bug in issue 2636: a row kept by this window that Changed cannot see.
  it('every browser-scoped row can say whether it differs from its default', () => {
    expect(browserRows().length).toBeGreaterThan(0);
    expect(Object.keys(BROWSER_CHANGED).sort()).toEqual(
      browserRows()
        .map((row) => row.id)
        .sort(),
    );
  });

  it('reads nothing changed with empty storage and changed once a choice is stored', () => {
    for (const row of browserRows()) expect(isBrowserChanged(row), row.id).toBe(false);
    localStorage.setItem('narration-ui-take-tone', 'on');
    localStorage.setItem('narration-ui-theme', 'dark');
    localStorage.setItem('narration-ui-motion', 'reduce');
    localStorage.setItem('narration-ui-ribbon-scroll-step', '25');
    localStorage.setItem('narration.script.text', JSON.stringify({ font: 'Verdana', size: 24, spacing: 2, width: 80 }));
    for (const row of browserRows()) expect(isBrowserChanged(row), row.id).toBe(true);
  });
});
