import { describe, expect, it } from 'vitest';
import type { ScopedSettingField } from '../../../types';
import { rowOf } from '../registry/rows';
import { isAnyChanged, isChanged } from './values';

const field = (value: string, isSet: boolean): ScopedSettingField => ({
  key: 'tts_provider',
  label: 'Provider',
  kind: 'choice',
  choices: ['piper'],
  value,
  isSet,
  effectiveValue: value || 'piper',
  effectiveSource: isSet ? 'global' : 'default',
});

describe('Changed for a fact row (issue 2980)', () => {
  const row = rowOf('voice.engine')!;

  it('is not changed while the stored value is the default or nothing is stored', () => {
    expect(isChanged(row, field('', false))).toBe(false);
    expect(isChanged(row, field(row.def, true))).toBe(false);
    expect(isAnyChanged(row, field('', false), undefined)).toBe(false);
  });

  it('still shows a stored value that differs, so a hand-edited file is not hidden behind the word Piper', () => {
    expect(isChanged(row, field('other', true))).toBe(true);
    expect(isAnyChanged(row, field('other', true), undefined)).toBe(true);
  });
});

describe('Changed ignores spaces alone (#3231)', () => {
  const row = { ...rowOf('voice.engine')!, def: '' };
  it('is not changed for a whitespace-only or empty stored value, and is for a real one', () => {
    expect(isChanged(row, field('   ', true))).toBe(false);
    expect(isChanged(row, field('', true))).toBe(false);
    expect(isChanged(row, field('Ada', true))).toBe(true);
  });
});
