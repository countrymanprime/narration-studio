// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOOTH_SIZE_STORAGE_KEY, readBoothSize } from '../../booth/page/boothSize';
import { BROWSER_CHANGED } from '../data/browserValues';
import { ROWS } from '../registry/rows';
import { search } from '../registry/search';
import { BoothTextSizeBody } from './AppearanceBodies';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('the Booth text size setting (parity audit)', () => {
  it('is a row of this window under Look, found by the words a narrator uses, and Changed reads it', () => {
    expect(ROWS.find((row) => row.id === 'look.boothSize')).toMatchObject({ cat: 'appearance', section: 'Look', scope: 'browser', used: ['booth'] });
    for (const query of ['booth text size', 'teleprompter text bigger', 'booth font size'])
      expect(search(query).some((hit) => hit.row?.id === 'look.boothSize')).toBe(true);
    expect(BROWSER_CHANGED['look.boothSize']?.()).toBe(false);
    localStorage.setItem(BOOTH_SIZE_STORAGE_KEY, '56');
    expect(BROWSER_CHANGED['look.boothSize']?.()).toBe(true);
  });

  it('shows 40 px until it is changed, and offers 24 to 72 in steps of 4', () => {
    render(<BoothTextSizeBody />);
    const slider = screen.getByRole('slider', { name: 'Booth text size' });
    expect(slider.getAttribute('aria-valuetext')).toBe('40 px');
    expect(slider.getAttribute('min')).toBe('24');
    expect(slider.getAttribute('max')).toBe('72');
    expect(slider.getAttribute('step')).toBe('4');
  });

  it('keeps a change for the Booth to read, the same key its own Text settings write', () => {
    render(<BoothTextSizeBody />);
    fireEvent.change(screen.getByRole('slider', { name: 'Booth text size' }), { target: { value: '60' } });
    expect(localStorage.getItem(BOOTH_SIZE_STORAGE_KEY)).toBe('60');
    expect(readBoothSize()).toBe(60);
    expect(screen.getByRole('slider', { name: 'Booth text size' }).getAttribute('aria-valuetext')).toBe('60 px');
  });

  it('starts from the size the Booth kept, and takes a stored value that is not a step as the default', () => {
    localStorage.setItem(BOOTH_SIZE_STORAGE_KEY, '28');
    render(<BoothTextSizeBody />);
    expect(screen.getByRole('slider', { name: 'Booth text size' }).getAttribute('aria-valuetext')).toBe('28 px');
    cleanup();
    localStorage.setItem(BOOTH_SIZE_STORAGE_KEY, '31');
    expect(readBoothSize()).toBe(40);
  });
});
