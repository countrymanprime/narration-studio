// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOOTH_SIZE_STORAGE_KEY, useTextChoices } from '../../booth/page/useTextChoices';
import { TEXT_PREFS_STORAGE_KEY, loadTextPrefs } from '../../script/page/tools/text/readerText';
import { TooltipProvider } from '../../primitives/Tooltip';
import { ReaderTextPanel } from './ReaderTextPanel';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

const mount = () =>
  render(
    <TooltipProvider>
      <ReaderTextPanel />
    </TooltipProvider>,
  );
const preview = () => screen.getByTestId('reader-text-preview');
const slider = (name: string) => screen.getByRole('slider', { name });

describe('Settings Reader text panel (SN-M94)', () => {
  it('saves the size, line height and font and redraws the preview', () => {
    mount();
    expect(preview().textContent).toContain('Off with her head!');
    expect(preview().style.fontSize).toBe('40px');
    fireEvent.change(slider('Size'), { target: { value: '56' } });
    fireEvent.change(slider('Line height'), { target: { value: '2.2' } });
    expect(preview().style.fontSize).toBe('56px');
    expect(preview().style.lineHeight).toBe('2.2');
    expect(window.localStorage.getItem(BOOTH_SIZE_STORAGE_KEY)).toBe('56');
    expect(loadTextPrefs().spacing).toBe(2.2);
    expect(JSON.parse(window.localStorage.getItem(TEXT_PREFS_STORAGE_KEY)!).spacing).toBe(2.2);
    expect(screen.getByRole('combobox', { name: 'Font' })).toBeTruthy();
  });

  it("a size chosen here is the Booth's size", () => {
    mount();
    fireEvent.change(slider('Size'), { target: { value: '60' } });
    cleanup();
    // The Booth reads the same saved choices when it opens.
    let seen = 0;
    function Probe() {
      seen = useTextChoices().size;
      return null;
    }
    render(<Probe />);
    expect(seen).toBe(60);
  });

  it("starts from the Booth's saved size", () => {
    window.localStorage.setItem(BOOTH_SIZE_STORAGE_KEY, '48');
    mount();
    expect(preview().style.fontSize).toBe('48px');
  });
});
