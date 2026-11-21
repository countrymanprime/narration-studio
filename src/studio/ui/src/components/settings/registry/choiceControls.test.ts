// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { wireSettings } from '../../../api/mockFixtures';
import type { ScopedSettingField } from '../../../types';
import { CUSTOM } from '../controls/registry';
import { choiceLabel, fieldChoiceLabel } from './choiceLabels';
import { checkChoiceControl, choiceControlFor, GROWS, PAGE_FIELD_CONTROLS, SEGMENT_COST, SEGMENTED_LABEL_BUDGET } from './choiceControls';
import { ROWS } from './rows';
import type { ChoiceControl, SettingMeta } from './types';

const SETTINGS = wireSettings();
const hostField = (tool: string, key: string): ScopedSettingField | undefined => SETTINGS[tool]?.find((field) => field.key === key);

/** A registry row the page's own renderer draws as a choice: it has a host choice field, and neither a body of its own nor a fact to state. */
const drawnAsChoice = (row: SettingMeta): boolean =>
  Boolean(row.field) && !row.fact && !(row.id in CUSTOM) && hostField(row.field!.tool, row.field!.key)?.kind === 'choice';

// The settings tools a "Set on a page" panel or a page's options dialog draws field by field (`PageSettingPanel`, and each `<ProofOptions tool=…>`),
// with the fields its filter leaves out. A choice of one of these is worded by `fieldChoiceLabel`, as its Settings row is when it has one.
const PANEL_TOOLS: Record<string, (key: string) => boolean> = {
  RecordingCoverage: () => true,
  Cleanup: () => true,
  Preview: () => true,
  StageRecommendations: () => true,
  TranscriptCompare: (key) => key !== 'model_size',
};

type Declared = { name: string; control: ChoiceControl; values: readonly string[]; labels: readonly string[]; grows: boolean };

const rowChoices: Declared[] = ROWS.filter(drawnAsChoice).map((row) => {
  const { tool, key } = row.field!;
  const values = hostField(tool, key)!.choices;
  return {
    name: `${row.id} (${tool}.${key})`,
    control: row.control ?? 'select',
    values,
    labels: values.map((value) => choiceLabel(row, value)),
    grows: GROWS.has(`${tool}.${key}`),
  };
});

const panelChoices: Declared[] = Object.entries(PANEL_TOOLS).flatMap(([tool, drawn]) =>
  (SETTINGS[tool] ?? [])
    .filter((field) => field.kind === 'choice' && drawn(field.key))
    .map((field) => ({
      name: `${tool}.${field.key} in a panel or an options dialog`,
      control: choiceControlFor(tool, field.key),
      values: field.choices,
      labels: field.choices.map((value) => fieldChoiceLabel(tool, field.key, value)),
      grows: GROWS.has(`${tool}.${field.key}`),
    })),
);

describe('the control each settings choice declares (component-selection CS-E6)', () => {
  it('has a declaration for every choice a registry row draws, and for no other row', () => {
    expect(rowChoices.length).toBeGreaterThan(10);
    for (const row of ROWS) expect(row.control !== undefined, row.id).toBe(drawnAsChoice(row));
  });

  it('has a declaration for every choice a panel or an options dialog draws', () => {
    expect(panelChoices.map((choice) => choice.name)).toContain('Preview.preset in a panel or an options dialog');
    for (const tool of Object.keys(PANEL_TOOLS))
      for (const field of (SETTINGS[tool] ?? []).filter((candidate) => candidate.kind === 'choice' && PANEL_TOOLS[tool](candidate.key))) {
        const declared =
          ROWS.some((row) => row.field?.tool === tool && row.field.key === field.key && row.control) ||
          `${tool}.${field.key}` in PAGE_FIELD_CONTROLS ||
          `${tool}.*` in PAGE_FIELD_CONTROLS;
        expect(declared, `${tool}.${field.key}`).toBe(true);
      }
  });

  it('names only fields the host offers as a choice, in the list for fields with no row and in the list of those that grow', () => {
    for (const name of Object.keys(PAGE_FIELD_CONTROLS)) {
      const [tool, key] = [name.slice(0, name.indexOf('.')), name.slice(name.indexOf('.') + 1)];
      const fields = (SETTINGS[tool] ?? []).filter((field) => field.kind === 'choice' && (key === '*' || field.key === key));
      expect(fields.length, name).toBeGreaterThan(0);
      expect(
        ROWS.some((row) => row.field?.tool === tool && (key === '*' || row.field.key === key) && row.control),
        `${name} has a registry row, which declares it`,
      ).toBe(false);
    }
    for (const name of GROWS) expect(hostField(name.slice(0, name.indexOf('.')), name.slice(name.indexOf('.') + 1))?.kind, name).toBe('choice');
  });

  it.each([...rowChoices, ...panelChoices])('$name is drawn by a control that fits its options', (choice) => {
    expect(checkChoiceControl(choice)).toBeUndefined();
  });

  it('draws a field the same way in a Settings row, a panel and an options dialog', () => {
    expect(choiceControlFor('TranscriptCompare', 'chunk_seconds')).toBe('radio');
    expect(choiceControlFor('Teleprompter', 'model')).toBe('segmented');
    expect(choiceControlFor('RecordingCoverage', 'chunk_seconds')).toBe('select');
    expect(choiceControlFor('Preview', 'preset')).toBe('segmented');
    expect(choiceControlFor('StageRecommendations', 'editing.clicks')).toBe('segmented');
    expect(choiceControlFor('Cleanup', 'not_a_choice')).toBe('select');
    expect(choiceControlFor(undefined, 'chunk_seconds')).toBe('select');
  });
});

describe('the rule itself', () => {
  const two = { values: ['a', 'b'], labels: ['Sample', 'Spot check'], grows: false };
  const six = { values: ['a', 'b', 'c', 'd', 'e', 'f'], labels: ['A', 'B', 'C', 'D', 'E', 'F'], grows: false };
  const zeroToTen = Array.from({ length: 11 }, (_, n) => String(n));

  it.each<[string, Parameters<typeof checkChoiceControl>[0], RegExp]>([
    ['a segmented group of one', { control: 'segmented', values: ['a'], labels: ['Whisper'], grows: false }, /2 to 5 options/],
    ['a segmented group of six', { control: 'segmented', ...six }, /2 to 5 options/],
    [
      'a segment of three words',
      { control: 'segmented', values: ['a', 'b'], labels: ['Candidates and stable', 'Stable only'], grows: false },
      /two words at most/,
    ],
    [
      'segments too long for the row together',
      { control: 'segmented', values: ['a', 'b'], labels: ['x'.repeat(SEGMENTED_LABEL_BUDGET - 2 * SEGMENT_COST), 'y'], grows: false },
      /characters/,
    ],
    // Each fits the budget by its letters alone: the segments' own padding is what does not fit.
    [
      'five short segments',
      { control: 'segmented', values: ['a', 'b', 'c', 'd', 'e'], labels: ['30 s', '60 s', '120 s', '300 s', '600 s'], grows: false },
      /characters/,
    ],
    [
      'the four compare lengths, which wrap beside Reset',
      { control: 'segmented', values: ['30', '60', '300', '600'], labels: ['30 s', '60 s', '300 s', '600 s'], grows: false },
      /characters/,
    ],
    [
      'the two live engines, which wrap beside Reset',
      { control: 'segmented', values: ['whisper', 'moonshine'], labels: ['Whisper', 'Moonshine (Windows)'], grows: false },
      /characters/,
    ],
    ['a segmented group of a list that grows', { control: 'segmented', ...two, grows: true }, /grows/],
    ['a radio group of six', { control: 'radio', ...six }, /2 to 5 options/],
    ['a radio group of one', { control: 'radio', values: ['a'], labels: ['Only'], grows: false }, /2 to 5 options/],
    ['a select of two that do not grow', { control: 'select', ...two }, /not a select/],
    ['a number box over five numbers', { control: 'number', values: ['0', '1', '2', '3', '4'], labels: [], grows: false }, /more than 5/],
    ['a number box over numbers with a gap', { control: 'number', values: ['0', '1', '2', '3', '4', '6'], labels: [], grows: false }, /consecutive/],
    ['a number box over words', { control: 'number', ...six }, /consecutive/],
  ])('refuses %s', (_name, choice, why) => {
    expect(checkChoiceControl(choice)).toMatch(why);
  });

  it('accepts each control over a list that fits it', () => {
    expect(checkChoiceControl({ control: 'segmented', ...two })).toBeUndefined();
    expect(checkChoiceControl({ control: 'radio', values: ['a', 'b'], labels: ['Candidates and stable', 'Stable only'], grows: false })).toBeUndefined();
    expect(checkChoiceControl({ control: 'select', ...six })).toBeUndefined();
    expect(checkChoiceControl({ control: 'select', ...two, grows: true })).toBeUndefined();
    expect(checkChoiceControl({ control: 'number', values: zeroToTen, labels: zeroToTen, grows: false })).toBeUndefined();
  });
});
