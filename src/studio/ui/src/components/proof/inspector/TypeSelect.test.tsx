// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FINDING_NOTE_TYPES } from '../../../api/contracts/findings';
import { inspectorFinding } from './testFinding';
import { TypeSelect } from './TypeSelect';

afterEach(cleanup);

describe('type-select-lists-the-ten-and-shows-the-current', () => {
  it('lists the ten words under the name "Type of finding"', () => {
    render(<TypeSelect finding={inspectorFinding()} onChange={() => {}} />);
    const select = screen.getByRole('combobox', { name: 'Type of finding' });
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual([...FINDING_NOTE_TYPES]);
  });

  it('shows the analyzer’s mapped type until the narrator chose one', () => {
    const { rerender } = render(<TypeSelect finding={inspectorFinding()} onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Type of finding' })).toHaveProperty('value', 'misread');
    rerender(<TypeSelect finding={inspectorFinding({ evidence: { kind: 'SKIPPED' } })} onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Type of finding' })).toHaveProperty('value', 'skip');
    rerender(<TypeSelect finding={inspectorFinding({ review: { status: 'unreviewed', type: 'pron' } })} onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Type of finding' })).toHaveProperty('value', 'pron');
  });

  it('reports the chosen word', () => {
    const onChange = vi.fn();
    render(<TypeSelect finding={inspectorFinding()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Type of finding' }), { target: { value: 'breath' } });
    expect(onChange).toHaveBeenCalledWith('breath');
  });

  it('is disabled with a sentence while the evidence-changed banner is up', () => {
    render(<TypeSelect finding={inspectorFinding()} onChange={() => {}} evidenceChanged />);
    const select = screen.getByRole('combobox', { name: 'Type of finding' });
    expect(select).toHaveProperty('disabled', true);
    expect(select.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText(/evidence changed/i)).toBeTruthy();
  });
});
