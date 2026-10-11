// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_PROFILES } from '../schedule/profiles';
import { ImportProfileField } from './ImportProfileField';

afterEach(cleanup);

describe('ImportProfileField', () => {
  it('offers ACX and Other / none under a visible label', () => {
    render(<ImportProfileField value="none" onChange={() => {}} />);
    expect(screen.getByText('Delivery profile')).toBeTruthy();
    const options = within(screen.getByRole('combobox', { name: 'Delivery profile' })).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['ACX', 'Other / none']);
  });

  it('reports the chosen profile', () => {
    const onChange = vi.fn();
    render(<ImportProfileField value="none" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Delivery profile' }), { target: { value: PLATFORM_PROFILES[0].id } });
    expect(onChange).toHaveBeenCalledWith(PLATFORM_PROFILES[0].id);
  });

  it('names no profile id in the component: the list is data', () => {
    const source = readFileSync(join(__dirname, 'ImportProfileField.tsx'), 'utf8');
    for (const profile of PLATFORM_PROFILES) expect(source).not.toMatch(new RegExp(`['"\`]${profile.id}['"\`]`));
  });
});
