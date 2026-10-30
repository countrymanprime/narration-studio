// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readScrollStep, SCROLL_STEP_STORAGE_KEY } from '../../editing/ribbon/scrollStep';
import { WaveScrollStepBody } from './AppearanceBodies';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('the waveform arrow step setting', () => {
  it('shows 20 s until it is changed, and offers 15 to 30', () => {
    render(<WaveScrollStepBody />);
    const slider = screen.getByRole('slider', { name: 'Waveform arrow step' });
    expect(slider.getAttribute('aria-valuetext')).toBe('20 s');
    expect(slider.getAttribute('min')).toBe('15');
    expect(slider.getAttribute('max')).toBe('30');
  });

  it('keeps a change for the waveform to read', () => {
    render(<WaveScrollStepBody />);
    fireEvent.change(screen.getByRole('slider', { name: 'Waveform arrow step' }), { target: { value: '27' } });
    expect(localStorage.getItem(SCROLL_STEP_STORAGE_KEY)).toBe('27');
    expect(readScrollStep()).toBe(27);
    expect(screen.getByRole('slider', { name: 'Waveform arrow step' }).getAttribute('aria-valuetext')).toBe('27 s');
  });

  it('starts from the kept step', () => {
    localStorage.setItem(SCROLL_STEP_STORAGE_KEY, '15');
    render(<WaveScrollStepBody />);
    expect(screen.getByRole('slider', { name: 'Waveform arrow step' }).getAttribute('aria-valuetext')).toBe('15 s');
  });
});
