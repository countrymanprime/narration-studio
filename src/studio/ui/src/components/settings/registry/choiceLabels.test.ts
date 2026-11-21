import { describe, expect, it } from 'vitest';
import { wireSettings } from '../../../api/mockFixtures';
import { choiceLabel, fieldChoiceLabel, unlistedChoiceLabel } from './choiceLabels';
import { PAGE_FIELD_CONTROLS } from './choiceControls';
import { ROWS, rowOfField } from './rows';

const SETTINGS = wireSettings();

// One value is one set of words (component-selection CS-E10): the Settings row reads `choiceLabel(row, …)`, the "Set on a page" panel and the
// options dialog read `fieldChoiceLabel(tool, key, …)`. They once had a list each ("60 s" in the row, "1m" in the panel and the dialog).
describe('the label of a settings choice, wherever it is drawn', () => {
  const rowsWithAChoice = ROWS.filter((row) => row.field && SETTINGS[row.field.tool]?.find((field) => field.key === row.field!.key)?.kind === 'choice');

  it('there are rows to check', () => {
    expect(rowsWithAChoice.length).toBeGreaterThan(10);
  });

  it.each(rowsWithAChoice.map((row) => [row.id, row] as const))('%s: a panel and a dialog say what the Settings row says, a stale value included', (_, row) => {
    const { tool, key } = row.field!;
    const offered = SETTINGS[tool]!.find((field) => field.key === key)!.choices;
    for (const value of [...offered, '', '45', 'abc']) expect(fieldChoiceLabel(tool, key, value), value).toBe(choiceLabel(row, value));
  });

  it('the compare chunk length reads in seconds everywhere', () => {
    const labels = ['30', '60', '300', '600'].map((value) => fieldChoiceLabel('TranscriptCompare', 'chunk_seconds', value));
    expect(labels).toEqual(['30 s', '60 s', '300 s', '600 s']);
    expect(fieldChoiceLabel('TranscriptCompare', 'chunk_seconds', 'abc')).toBe('abc (invalid)');
    expect(fieldChoiceLabel('TranscriptCompare', 'chunk_seconds', '45')).toBe('45 s');
  });

  it('a choice with no row has its words here: the preview presets and a readiness signal’s two policies', () => {
    expect(rowOfField('Preview', 'preset')).toBeUndefined();
    expect(['sample', 'spot_check'].map((value) => fieldChoiceLabel('Preview', 'preset', value))).toEqual(['Sample', 'Spot check']);
    expect(['required', 'ignored'].map((value) => fieldChoiceLabel('StageRecommendations', 'editing.clicks', value))).toEqual(['Required', 'Ignored']);
  });

  it('every choice a page draws without a row is worded for each value the host offers', () => {
    for (const name of Object.keys(PAGE_FIELD_CONTROLS)) {
      const [tool, key] = [name.slice(0, name.indexOf('.')), name.slice(name.indexOf('.') + 1)];
      const fields = (SETTINGS[tool] ?? []).filter((field) => field.kind === 'choice' && (key === '*' || field.key === key));
      expect(fields.length, name).toBeGreaterThan(0);
      for (const field of fields) for (const value of field.choices) expect(fieldChoiceLabel(tool, field.key, value), `${name} ${value}`).not.toBe(value);
    }
  });

  it('a value nobody listed is named one way: empty is Not set, a unit marks a whole number and calls the rest invalid', () => {
    expect(unlistedChoiceLabel('')).toBe('Not set');
    expect(unlistedChoiceLabel('abc')).toBe('abc');
    expect(unlistedChoiceLabel('45', 's')).toBe('45 s');
    expect(unlistedChoiceLabel('4.5', 's')).toBe('4.5 (invalid)');
    expect(fieldChoiceLabel('Nowhere', 'nothing', '')).toBe('Not set');
    expect(fieldChoiceLabel(undefined, 'nothing', 'raw')).toBe('raw');
  });
});
