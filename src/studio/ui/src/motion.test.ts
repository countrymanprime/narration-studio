// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAppExtension, resetAppExtension } from './appExtension';
import {
  MOTION_STORAGE_KEY,
  PLAY_MOTION_STORAGE_KEY,
  applyMotion,
  readStoredMotion,
  readStoredPlay,
  reducedMotion,
  setPlayAnimations,
  useMotionPreference,
} from './motion';

// Every transition and animation is gated on `motion-ok:` (styles.css), so it stops when Windows asks for reduced motion or
// when <html data-motion="reduce"> is set. `motion-safe:` reads only the media query, so it is not enough. The visual suite,
// the atlas and Storybook all freeze motion, so this scan is the only check on the reduced-motion path.
const SRC = join(import.meta.dirname);
const MOTION = /^(transition(-.+)?|animate-.+|duration-.+|ease-.+|delay-.+)$/;
const STILL = new Set(['transition-none', 'animate-none', 'duration-0', 'delay-0']);
// A duration or easing reads a token, never a literal: `duration-(--motion-fast)`, `ease-(--ease-enter)`.
const TOKEN_DURATION = /^duration-\(--motion-[a-z]+\)$/;
const TOKEN_EASE = /^ease-\(--ease-[a-z]+\)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Splits `a:[b:c]:d` into its variants and utility, ignoring colons inside brackets and parentheses. */
function variantsOf(token: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of token) {
    if (char === '[' || char === '(') depth++;
    if (char === ']' || char === ')') depth--;
    if (char === ':' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += char;
  }
  return [...parts, current];
}

/** The string literals of a source file whose text looks like a class list, with comments removed. */
function classLists(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const literals = [...code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)].map((match) => match[1] ?? match[2] ?? match[3]);
  return literals.map((text) => text.replace(/\$\{|\}/g, ' ')).filter((text) => text.split(/\s+/).some((token) => /[-:[]/.test(token)));
}

/** Drops the quotes and punctuation around a class in a template, and a closing parenthesis it does not open. */
function trimQuotes(token: string): string {
  let text = token.replace(/^['"(]+|['",;]+$/g, '');
  while (text.endsWith(')') && text.split(')').length > text.split('(').length) text = text.slice(0, -1);
  return text;
}

function offences(): string[] {
  return sourceFiles(SRC).flatMap((file) =>
    classLists(readFileSync(file, 'utf8')).flatMap((text) =>
      text
        .split(/\s+/)
        .map(trimQuotes)
        .filter(Boolean)
        .flatMap((token) => {
          const parts = variantsOf(token);
          const utility = parts.at(-1)!;
          const variants = parts.slice(0, -1);
          const where = `${relative(SRC, file)}: ${token}`;
          // Base UI's first and last frames: ungated, the popup or drawer is invisible or off screen for a frame under reduced
          // motion, and a check that reads it then finds nothing (#1456).
          if (variants.some((variant) => /^data-\[(starting|ending)-style\]$/.test(variant)) && !variants.includes('motion-ok'))
            return [`${where} (a starting or ending style is gated on motion-ok:)`];
          if (!MOTION.test(utility) || STILL.has(utility)) return [];
          if (variants.includes('motion-safe')) return [`${where} (motion-safe: misses data-motion; use motion-ok:)`];
          if (!variants.includes('motion-ok') && !variants.includes('motion-reduce')) return [`${where} (not gated on motion-ok:)`];
          if (utility.startsWith('duration-') && !TOKEN_DURATION.test(utility)) return [`${where} (use a --motion-* token)`];
          if (utility.startsWith('ease-') && !TOKEN_EASE.test(utility)) return [`${where} (use an --ease-* token)`];
          return [];
        }),
    ),
  );
}

describe('motion', () => {
  it('every transition, animation, starting and ending style is gated on motion-ok: and timed by a token', () => {
    expect(offences()).toEqual([]);
  });

  it('styles.css defines the motion tokens and zeroes them under reduced motion', () => {
    const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
    for (const token of [
      '--motion-fast',
      '--motion-base',
      '--motion-slow',
      '--motion-highlight',
      '--ease-standard',
      '--ease-enter',
      '--ease-exit',
      '--motion-shift',
    ]) {
      expect(css).toContain(`${token}:`);
    }
    expect(css).toMatch(/@custom-variant motion-ok/);
    expect(css).toMatch(/html\[data-motion='reduce'\]/);
  });

  it("styles.css lets the demo's data-motion='play' beat the device: the variant applies and the tokens and still form stand down", () => {
    const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
    expect(css).toMatch(/@custom-variant motion-ok \{[\s\S]*?&:where\(html\[data-motion='play'\] \*\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*html:not\(\[data-motion='play'\]\) \{/);
    expect(css).toMatch(/@custom-variant motion-still \{\s*@media \(prefers-reduced-motion: reduce\) \{\s*&:where\(html:not\(\[data-motion='play'\]\) \*\)/);
  });
});

describe('reducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.motion;
  });
  const windowsAsks = (reduce: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce') }));

  it('is false when neither Windows nor the app asks', () => {
    windowsAsks(false);
    expect(reducedMotion()).toBe(false);
  });

  it('is true when Windows asks for reduced motion', () => {
    windowsAsks(true);
    expect(reducedMotion()).toBe(true);
  });

  it('is true when <html data-motion="reduce"> is set', () => {
    windowsAsks(false);
    document.documentElement.dataset.motion = 'reduce';
    expect(reducedMotion()).toBe(true);
  });
});

describe('the Motion setting', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    delete document.documentElement.dataset.motion;
  });

  it('reads Follow Windows unless this browser saved Reduce', () => {
    expect(readStoredMotion()).toBe('system');
    localStorage.setItem(MOTION_STORAGE_KEY, 'reduce');
    expect(readStoredMotion()).toBe('reduce');
    localStorage.setItem(MOTION_STORAGE_KEY, 'sideways');
    expect(readStoredMotion()).toBe('system');
  });

  it('reads Follow Windows when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredMotion()).toBe('system');
  });

  it('sets and clears <html data-motion>', () => {
    applyMotion('reduce');
    expect(document.documentElement.dataset.motion).toBe('reduce');
    applyMotion('system');
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('saves the choice, applies it and still applies it when storage throws', () => {
    const { result } = renderHook(() => useMotionPreference());
    expect(result.current[0]).toBe('system');
    act(() => result.current[1]('reduce'));
    expect(result.current[0]).toBe('reduce');
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe('reduce');
    expect(reducedMotion()).toBe(true);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    act(() => result.current[1]('system'));
    expect(result.current[0]).toBe('system');
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });
});

describe("the demo's Play animations switch", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetAppExtension();
    delete document.documentElement.dataset.motion;
  });
  const windowsAsks = () => vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));

  it('is off by default and does nothing in a build whose extension does not offer it', () => {
    resetAppExtension();
    localStorage.setItem(PLAY_MOTION_STORAGE_KEY, '1');
    expect(readStoredPlay()).toBe(false);
    setPlayAnimations(true);
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(localStorage.getItem(PLAY_MOTION_STORAGE_KEY)).toBe('1');
  });

  it('in a build that offers the switch plays motion although the device asks for reduced motion, and switches back', () => {
    registerAppExtension({ playAnimations: true });
    windowsAsks();
    expect(readStoredPlay()).toBe(false);
    expect(reducedMotion()).toBe(true);
    setPlayAnimations(true);
    expect(document.documentElement.dataset.motion).toBe('play');
    expect(localStorage.getItem(PLAY_MOTION_STORAGE_KEY)).toBe('1');
    expect(readStoredPlay()).toBe(true);
    expect(reducedMotion()).toBe(false);
    setPlayAnimations(false);
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(localStorage.getItem(PLAY_MOTION_STORAGE_KEY)).toBeNull();
    expect(reducedMotion()).toBe(true);
  });

  it("wins over Settings' Reduce while on, and Reduce returns when it is switched off", () => {
    registerAppExtension({ playAnimations: true });
    localStorage.setItem(MOTION_STORAGE_KEY, 'reduce');
    applyMotion('reduce');
    expect(document.documentElement.dataset.motion).toBe('reduce');
    setPlayAnimations(true);
    expect(document.documentElement.dataset.motion).toBe('play');
    applyMotion('reduce');
    expect(document.documentElement.dataset.motion).toBe('play');
    setPlayAnimations(false);
    expect(document.documentElement.dataset.motion).toBe('reduce');
  });

  it('still plays for this window when storage throws, and reads on until switched off', () => {
    registerAppExtension({ playAnimations: true });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    setPlayAnimations(true);
    expect(document.documentElement.dataset.motion).toBe('play');
    expect(readStoredPlay()).toBe(true);
    setPlayAnimations(false);
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('reads off when storage throws and this window has not switched it on', () => {
    registerAppExtension({ playAnimations: true });
    setPlayAnimations(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredPlay()).toBe(false);
  });
});
