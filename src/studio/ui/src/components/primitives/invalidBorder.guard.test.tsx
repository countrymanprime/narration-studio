// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DateField } from './DateField';
import { Field } from './Field';
import { NumberInput } from './NumberInput';
import { TextField } from './TextField';

afterEach(cleanup);

// Class guard (#4100): a text-like primitive that is marked wrong shows it, not only in its message. Every one is rendered invalid and must carry the danger border.
const DANGER = /(aria-\[invalid=true\]|data-\[invalid\]):border-\[var\(--danger\)\]/;

describe('every text-like primitive draws a wrong value with the danger border', () => {
  it.each([
    ['TextField', () => <TextField label="Box" value="" onChange={() => undefined} aria-invalid />],
    ['DateField', () => <DateField label="Box" value="" onChange={() => undefined} aria-invalid />],
    ['NumberInput', () => <NumberInput label="Box" value={1} onValueChange={() => undefined} invalid />],
    ['Field', () => <Field label="Box" value="" onChange={() => undefined} invalid />],
  ])('%s', (_name, ui) => {
    render(ui());
    expect(screen.getByLabelText('Box').className).toMatch(DANGER);
  });
});

// A new text-entry primitive is caught: every primitive that draws a native input or textarea is either rendered above or named here with why it has no invalid look.
const EXEMPT: Readonly<Record<string, string>> = {
  'Select.tsx': 'a choice from a list: it cannot hold a value that is wrong, only one that is unavailable',
  'TagInput.tsx': 'a list of chips; each chip is checked as it is added and a refused one is not kept, so the box never holds a wrong value',
};
const COVERED = ['DateField.tsx', 'Field.tsx', 'TextField.tsx'];

describe('every primitive that draws a text entry is covered or says why not', () => {
  it('lists none unaccounted for', () => {
    const dir = join(__dirname);
    const drawing = readdirSync(dir).filter(
      (f) => /\.tsx$/.test(f) && !/\.(test|stories)\./.test(f) && /react\/input'|<input|<textarea|<Input/.test(readFileSync(join(dir, f), 'utf8')),
    );
    expect(drawing.filter((f) => !COVERED.includes(f) && !(f in EXEMPT))).toEqual([]);
    expect(Object.keys(EXEMPT).filter((f) => !drawing.includes(f))).toEqual([]);
  });
});
