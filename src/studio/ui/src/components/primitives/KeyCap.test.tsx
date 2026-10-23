// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KEY_GLYPHS, KeyCap, KeyChord, canonicalKey, glyphOf, keyName } from './KeyCap';

afterEach(cleanup);

const caps = (container: HTMLElement) => [...container.querySelectorAll('kbd')];

describe('KeyCap', () => {
  it('arrows-enter-esc-tab-backspace-are-glyphs-with-names', () => {
    const { container } = render(<KeyChord keys={['↑', '↓', '←', '→', 'Enter', 'Esc', 'Tab', 'Backspace']} />);
    const all = caps(container);
    expect(all).toHaveLength(8);
    for (const cap of all) {
      expect(cap.querySelector('svg')).not.toBeNull();
      const name = cap.querySelector('.sr-only')?.textContent;
      expect(name).toBeTruthy();
      expect(cap.getAttribute('title')).toBe(name);
    }
    expect(all.map((cap) => cap.querySelector('.sr-only')?.textContent)).toEqual([
      'Up arrow',
      'Down arrow',
      'Left arrow',
      'Right arrow',
      'Enter',
      'Esc',
      'Tab',
      'Backspace',
    ]);
  });

  it('space-and-right-click-are-drawn', () => {
    const { container } = render(<KeyChord keys={['Space', 'Right-click']} />);
    const [space, click] = caps(container);
    expect(space.getAttribute('data-key')).toBe('Space');
    expect(space.querySelector('svg')).not.toBeNull();
    expect(space.querySelector('.sr-only')?.textContent).toBe('Space');
    expect(click.getAttribute('data-key')).toBe('RightClick');
    expect(click.querySelector('svg path[fill="currentColor"]')).not.toBeNull();
    expect(click.querySelector('.sr-only')?.textContent).toBe('Right-click');
  });

  it('other-keys-stay-text', () => {
    const keys = ['R', 'Ctrl', 'Shift', 'Alt', 'F11', 'Page Up'];
    const { container } = render(<KeyChord keys={keys} />);
    expect(caps(container).map((cap) => cap.textContent)).toEqual(keys);
    for (const cap of caps(container)) expect(cap.querySelector('svg')).toBeNull();
  });

  it('other-spellings-resolve', () => {
    expect(canonicalKey('↑')).toBe('ArrowUp');
    expect(canonicalKey('Up')).toBe('ArrowUp');
    expect(canonicalKey('Esc')).toBe(canonicalKey('Escape'));
    expect(glyphOf('Return')).toBe(KEY_GLYPHS.Enter);
    expect(glyphOf('↵')).toBe(KEY_GLYPHS.Enter);
    expect(glyphOf('Right-click')).toBe(KEY_GLYPHS.RightClick);
    expect(keyName('→')).toBe('Right arrow');
    expect(keyName('Q')).toBe('Q');
  });

  it('draws the 18 px cap by default and the 23 px cap for size md', () => {
    const { container } = render(
      <>
        <KeyCap k="Enter" />
        <KeyCap k="Enter" size="md" />
      </>,
    );
    const [small, medium] = caps(container);
    expect(small.className).toContain('h-[1.125rem]');
    expect(medium.className).toContain('h-[1.4375rem]');
  });
});
