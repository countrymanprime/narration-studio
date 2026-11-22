// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { providedCommands } from '../../../input/commandProviders';
import type { NarrationApi, ScopedSettingField } from '../../../types';
import { TooltipProvider } from '../../primitives/Tooltip';
import { ProofOptions } from '../../proof/proofOptions/ProofOptions';
import { ScopedSetting } from '../ScopedSetting';
import { rowOfField } from '../registry/panelFields';
import { ROWS } from '../registry/rows';
import { ValueControl } from '../row/ValueControl';
import { choiceLabel } from './values';

afterEach(cleanup);

/**
 * One word list for a host choice (component selection M9, #3681): the Settings row, a page's options dialog and the Settings panels' generic
 * field name the same value with the same word, a stored value the host does not offer included.
 */

// Every host field a row of its own edits with words for its choices, and one field of each panel row that has words.
const OWN_FIELDS = ROWS.flatMap((row) => (row.field && row.options ? [{ tool: row.field.tool, key: row.field.key }] : []));
const PANEL_FIELDS = [
  { tool: 'Preview', key: 'preset' },
  { tool: 'StageRecommendations', key: 'recording.text_present' },
];
const STALE = 'abc';

const field = (key: string, choices: string[], value: string): ScopedSettingField => ({
  key,
  label: 'The choice',
  kind: 'choice',
  choices,
  value,
  isSet: true,
  effectiveValue: value,
  effectiveSource: 'project',
});

const optionWords = () => Array.from((screen.getByRole('combobox', { name: 'The choice' }) as HTMLSelectElement).options).map((option) => option.textContent);

function settingsRowWords(tool: string, key: string, choices: string[], value: string) {
  render(
    <ValueControl
      row={{ ...rowOfField(tool, key)!, label: 'The choice' }}
      field={field(key, choices, value)}
      value={value}
      id="c"
      onChange={() => undefined}
    />,
  );
  return optionWords();
}

function scopedSettingWords(tool: string, key: string, choices: string[], value: string) {
  render(
    <TooltipProvider>
      <ScopedSetting tool={tool} field={field(key, choices, value)} scope="project" value={value} change={() => undefined} onClearOverride={() => undefined} />
    </TooltipProvider>,
  );
  return optionWords();
}

async function optionsDialogWords(tool: string, key: string, choices: string[], value: string) {
  const api = createMockApi({ settingsForScope: async () => ({ [tool]: [field(key, choices, value)] }) } as Partial<NarrationApi>);
  render(
    <ApiProvider api={api}>
      <ProofOptions title="Choice options" group="Proof" tool={tool} keys={[key]} />
    </ApiProvider>,
  );
  await act(() =>
    providedCommands()
      .find((command) => command.label === 'Open Choice options')!
      .run(),
  );
  await screen.findByRole('combobox', { name: 'The choice' });
  return optionWords();
}

describe('a host choice has one word list', () => {
  it.each([...OWN_FIELDS, ...PANEL_FIELDS])('$tool.$key: Settings, the options dialog and the settings panel say the same words', async ({ tool, key }) => {
    const row = rowOfField(tool, key);
    expect(row?.options, 'the row has words for its choices').toBeDefined();
    const choices = Object.keys(row!.options!);
    const expected = choices.map((choice) => choiceLabel(row, choice));
    for (const value of [choices[0]!, STALE]) {
      const shown = value === STALE ? [choiceLabel(row, STALE), ...expected] : expected;
      expect(settingsRowWords(tool, key, choices, value), `Settings, ${value}`).toEqual(shown);
      cleanup();
      expect(scopedSettingWords(tool, key, choices, value), `settings panel, ${value}`).toEqual(shown);
      cleanup();
      expect(await optionsDialogWords(tool, key, choices, value), `options dialog, ${value}`).toEqual(shown);
      cleanup();
    }
  });

  it('names a chunk length the same way everywhere, and a hand-edited one as invalid', async () => {
    const choices = ['30', '60', '300', '600'];
    const words = ['abc (invalid)', '30 s', '60 s', '300 s', '600 s'];
    expect(settingsRowWords('TranscriptCompare', 'chunk_seconds', choices, STALE)).toEqual(words);
    cleanup();
    expect(scopedSettingWords('TranscriptCompare', 'chunk_seconds', choices, STALE)).toEqual(words);
    cleanup();
    expect(await optionsDialogWords('TranscriptCompare', 'chunk_seconds', choices, STALE)).toEqual(words);
  });

  it('gives the words that were only on the Proof page to their rows', () => {
    expect(choiceLabel(rowOfField('Preview', 'preset'), 'spot_check')).toBe('Spot check');
    expect(choiceLabel(rowOfField('StageRecommendations', 'editing.clicks'), 'required')).toBe('Required');
    expect(choiceLabel(rowOfField('RecordingCoverage', 'chunk_seconds'), '0')).toBe('Each file whole');
    expect(choiceLabel(rowOfField('ManuscriptGuide', 'default_pronunciation_source'), 'espeak')).toBe('eSpeak');
  });
});
