// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KeyHint } from './KeyHint';

afterEach(cleanup);

describe('KeyHint', () => {
  it('draws a key cap named by its keys, next to the visible action label', () => {
    render(<KeyHint keys={['Space']} action="Play" />);
    expect(screen.getByRole('img', { name: 'Space' })).toBeTruthy();
    expect(screen.getByText('Play')).toBeTruthy();
  });

  it('passes a spoken label through to the cap for a symbol key, leaving the visible action untouched', () => {
    render(<KeyHint keys={['⌫']} action="Erase" spokenLabel="Backspace" />);
    expect(screen.getByRole('img', { name: 'Backspace' })).toBeTruthy();
    expect(screen.getByText('Erase')).toBeTruthy();
  });

  it('draws the booth-sized cap when asked', () => {
    render(<KeyHint keys={['R']} action="Record" size="md" />);
    expect(screen.getByRole('img').querySelector('kbd')?.className).toContain('h-[1.4375rem]');
  });

  it('draws the companion/settings-sized cap by default', () => {
    render(<KeyHint keys={['R']} action="Record" />);
    expect(screen.getByRole('img').querySelector('kbd')?.className).toContain('h-[1.125rem]');
  });
});

describe('KeyHint composes the cap', () => {
  it('keyhint-composes-the-cap: a glyph key draws a KeyCap, any other key the text Kbd', () => {
    const { container, rerender } = render(<KeyHint keys={['Enter']} action="Keep" />);
    expect(container.querySelector('kbd[data-key="Enter"] svg')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Enter' })).toBeTruthy();
    rerender(<KeyHint keys={['R']} action="Record" />);
    expect(container.querySelector('kbd[data-key]')).toBeNull();
    expect(screen.getByRole('img', { name: 'R' })).toBeTruthy();
  });

  it('names a mixed chord by every key', () => {
    render(<KeyHint keys={['Ctrl', '←']} action="Word" />);
    expect(screen.getByRole('img', { name: 'Ctrl + Left arrow' })).toBeTruthy();
  });
});
