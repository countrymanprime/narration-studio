// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_OUTPUT, OUTPUT_STORAGE_KEY, readOutputPrefs } from '../../engine/outputPrefs';
import { BROWSER_CHANGED } from '../data/browserValues';
import { ROWS } from '../registry/rows';
import { search } from '../registry/search';
import { PlaybackBody } from './AppearanceBodies';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('the Editing playback setting (parity audit)', () => {
  it('is a row of this window under Listening, found by the words a narrator uses, and Changed reads it', () => {
    expect(ROWS.find((row) => row.id === 'look.playback')).toMatchObject({ cat: 'appearance', section: 'Listening', scope: 'browser', used: ['editing'] });
    for (const query of ['playback speed', 'editing volume', 'output device', 'mute playback'])
      expect(search(query).some((hit) => hit.row?.id === 'look.playback')).toBe(true);
    expect(BROWSER_CHANGED['look.playback']?.()).toBe(false);
    localStorage.setItem(OUTPUT_STORAGE_KEY, JSON.stringify({ ...DEFAULT_OUTPUT, rate: 1.5 }));
    expect(BROWSER_CHANGED['look.playback']?.()).toBe(true);
  });

  it('shows the Editing page’s choices: 1×, 100%, not muted', () => {
    render(<PlaybackBody />);
    expect(screen.getByRole('button', { name: '1×' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('slider', { name: 'Playback volume' }).getAttribute('aria-valuetext')).toBe('100%');
    expect(screen.getByRole('checkbox', { name: 'Silence playback' }).getAttribute('aria-checked')).toBe('false');
  });

  it('keeps each change for the Editing page to read, in the key its own Output popover writes', () => {
    render(<PlaybackBody />);
    fireEvent.click(screen.getByRole('button', { name: '1.5×' }));
    expect(readOutputPrefs().rate).toBe(1.5);
    fireEvent.change(screen.getByRole('slider', { name: 'Playback volume' }), { target: { value: '40' } });
    expect(readOutputPrefs().volume).toBe(40);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Silence playback' }));
    expect(readOutputPrefs().muted).toBe(true);
    expect(JSON.parse(localStorage.getItem(OUTPUT_STORAGE_KEY)!)).toMatchObject({ rate: 1.5, volume: 40, muted: true });
  });

  it('starts from what the Editing page kept', () => {
    localStorage.setItem(OUTPUT_STORAGE_KEY, JSON.stringify({ volume: 25, muted: true, rate: 2, device: '' }));
    render(<PlaybackBody />);
    expect(screen.getByRole('button', { name: '2×' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('slider', { name: 'Playback volume' }).getAttribute('aria-valuetext')).toBe('25%');
    expect(screen.getByRole('checkbox', { name: 'Silence playback' }).getAttribute('aria-checked')).toBe('true');
  });
});
