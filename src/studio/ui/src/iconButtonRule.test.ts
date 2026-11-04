import { describe, expect, test } from 'vitest';
// @ts-expect-error the audit is a plain .mjs script with no declaration file
import { auditButtons, escapeCell } from '../scripts/iconButtonAudit.mjs';
import { CATALOG, TOOLTIP_VERBS } from './icons.catalog';

// Owner rule (icon-button audit, #2836): a secondary action in a row, a list or a toolbar is an `IconButton` with a catalogue hint, not a text
// `Button`. This guard finds a text `Button` in a row or toolbar whose label starts with a verb the catalogue already uses for a tooltip
// (`TOOLTIP_VERBS`), so the verb has an icon row waiting. Primary, link-style and `{expression}` labels are out of scope, as they are in
// docs/research/2026-11-icon-button-audit.md, which lists every button and why it stays text.

type Found = { file: string; label: string; variant: string; context: string };

// SHRINK-ONLY. Each entry is a button that still draws text, with why. Remove an entry when its button becomes an `IconButton`; the test below fails
// on an entry that no longer matches a button. Never add one without the owner: convert the button instead. `MAX_EXCEPTIONS` only goes down.
const EXCEPTIONS: Record<string, string> = {
  'editing/output/OutputControls.tsx|Check again': 'queued: Editing page PR (#2836)',
  'editing/voicesample/SampleMark.tsx|Open in Story Bible': 'queued: Editing page PR (#2836); a page link, `openInStoryBible`',
  'layout/HistoryPanel.tsx|Undo': 'queued: shell PR (#2836); a row of the undo history, `undo`',
  'master/MasterToSpecPanel.tsx|Remove': 'queued: Master PR (#2836); a file row, `remove`',
  'pickups/list/PickupsTable.tsx|Go to the note in Proof': 'queued: Pickups PR (#2836); a page link',
  'production/ChapterTrackPanel.tsx|Keep this one': 'queued: Production PR (#2836); a candidate row',
  'production/CreditsRowPanel.tsx|Check recordings…': 'queued: Production PR (#2836); `checkRecordings`',
  'production/RecordingCheckReport.tsx|Go to paragraph {first.number}': 'queued: Production PR (#2836); `locate`',
  'project/ProjectPicker.tsx|Open': 'queued: Project PR (#2836); a project row',
  'proof/checkcard/FindingRow.tsx|Accept': 'queued: Proof PR (#2836); `accept`',
  'recordingcheck/CheckRecordingsDialog.tsx|Show result': 'queued: Proof PR (#2836); a chapter row',
  'script/page/rail/words/DefinitionBlock.tsx|Use': 'queued: Script PR (#2836); a definition row',
  'storybible/OnlinePronunciationLookup.tsx|Use this': 'queued: Story Bible PR (#2836); a result row',
};
const MAX_EXCEPTIONS = 13;

const NOT_TEXT_ACTIONS = new Set(['link', 'primary', 'danger-solid', 'native']);

// A verb the catalogue lists as a `text` row (Cancel, Save, Reopen, Reset, Compare, Clear filters, Scan…) has no unambiguous icon (audit rule 6), so a text button that
// starts with it is the catalogue's own answer, not a miss.
const TEXT_VERBS = new Set(
  Object.values(CATALOG)
    .filter((row) => row.kind === 'text')
    .map((row) => row.tooltip.split(' ')[0]!),
);

function violations(): Found[] {
  const verbs = new Set<string>([...TOOLTIP_VERBS].filter((verb) => !TEXT_VERBS.has(verb)));
  return (auditButtons() as Found[]).filter(
    (r) =>
      (r.context === 'row' || r.context === 'toolbar') &&
      !NOT_TEXT_ACTIONS.has(String(r.variant)) &&
      !r.label.startsWith('{') &&
      verbs.has(r.label.split(' ')[0]!),
  );
}

const keyOf = (r: Found) => `${r.file.replace('components/', '')}|${r.label}`;

describe('row and toolbar actions are icon buttons', () => {
  test('a text Button in a row or toolbar that starts with a tooltip verb is listed with a reason', () => {
    const unlisted = violations()
      .filter((r) => EXCEPTIONS[keyOf(r)] === undefined)
      .map(keyOf);
    expect(unlisted, 'convert these to IconButton with a catalogue action, or ask the owner for an exception').toEqual([]);
  });

  test('the exception list names only buttons that still exist (it shrinks as they are converted)', () => {
    const live = new Set(violations().map(keyOf));
    expect(Object.keys(EXCEPTIONS).filter((key) => !live.has(key))).toEqual([]);
  });

  test('the exception list never grows', () => {
    expect(Object.keys(EXCEPTIONS).length).toBeLessThanOrEqual(MAX_EXCEPTIONS);
  });

  test('every exception carries a reason', () => {
    for (const [key, reason] of Object.entries(EXCEPTIONS)) expect(reason.length, key).toBeGreaterThan(10);
  });
});

// Code-scanning alert 115: the audit table's cell escape did not escape backslashes, so a label ending in one could swallow the pipe after it.
describe('escapeCell, the audit table cell escape', () => {
  test('escapes a backslash before a pipe so the two stay two characters', () => {
    expect(escapeCell('a\\|b')).toBe('a\\\\\\|b');
  });
  test('escapes a lone backslash and a lone pipe', () => {
    expect(escapeCell('a\\b')).toBe('a\\\\b');
    expect(escapeCell('a|b')).toBe('a\\|b');
  });
  test('folds whitespace and cuts at 70 characters', () => {
    expect(escapeCell('a \n  b')).toBe('a b');
    expect(escapeCell('x'.repeat(100))).toHaveLength(70);
  });
});
