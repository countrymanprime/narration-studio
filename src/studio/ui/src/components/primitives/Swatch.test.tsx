// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseThemes } from '../../tokenContrast';
import { Swatch, SWATCH_COLOURS, type SwatchColour } from './Swatch';

afterEach(cleanup);

const CSS = readFileSync(join(__dirname, '../../styles.css'), 'utf8');
const THEMES = parseThemes(CSS);
const declared = new Set([...CSS.matchAll(/^\s*--([a-z0-9-]+)\s*:/gm)].map((m) => m[1]));

const resolve = (tokens: Record<string, string>, name: string, depth = 0): string => {
  const raw = tokens[`--${name}`] ?? tokens[name];
  if (raw === undefined || depth > 10) return '';
  const ref = /^var\(--([a-z0-9-]+)\)$/.exec(raw.trim());
  return ref ? resolve(tokens, ref[1], depth + 1) : raw.trim();
};

const swatch = (ui: React.ReactElement) => render(ui).container.firstElementChild as HTMLElement;

describe('Swatch', () => {
  it('draws a twelve px rounded square, hidden from assistive tech', () => {
    const el = swatch(<Swatch colour="accent" />);
    expect(el.style.width).toBe('12px');
    expect(el.style.height).toBe('12px');
    expect(el.style.borderRadius).toBe('3px');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.hasAttribute('tabindex')).toBe(false);
  });

  it('overrides both sides with size', () => {
    const el = swatch(<Swatch colour="accent" size={16} />);
    expect(el.style.width).toBe('16px');
    expect(el.style.height).toBe('16px');
  });

  it('takes a token name, not a value', () => {
    expect(swatch(<Swatch colour="accent" />).style.background).toBe('var(--accent)');
    // @ts-expect-error a raw colour is not a SwatchColour
    expect(() => render(<Swatch colour="#ff0000" />)).toThrow();
    // @ts-expect-error neither is an rgb() value
    expect(() => render(<Swatch colour="rgb(1,2,3)" />)).toThrow();
    // @ts-expect-error nor a name styles.css does not define
    expect(() => render(<Swatch colour="copper" />)).toThrow();
  });

  it('only offers names styles.css declares', () => {
    for (const name of SWATCH_COLOURS) expect(declared.has(name), name).toBe(true);
  });

  it('resolves to different fills in the light and dark blocks', () => {
    const differing = SWATCH_COLOURS.filter((c: SwatchColour) => resolve(THEMES.light, c) !== resolve(THEMES.dark, c));
    expect(differing).toContain('accent');
    for (const name of SWATCH_COLOURS) {
      expect(resolve(THEMES.light, name), `${name} light`).not.toBe('');
      expect(resolve(THEMES.dark, name), `${name} dark`).not.toBe('');
    }
  });

  it('sits on the text middle and does not shrink in a flex row', () => {
    const el = swatch(<Swatch colour="place" />);
    expect(el.className).toContain('shrink-0');
    expect(el.className).toContain('self-center');
    expect(el.className).toContain('align-middle');
  });
});
