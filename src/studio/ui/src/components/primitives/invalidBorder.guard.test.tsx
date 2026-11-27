// @vitest-environment jsdom
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
