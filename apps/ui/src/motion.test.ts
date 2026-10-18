// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reducedMotion } from './motion';

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
          if (!MOTION.test(utility) || STILL.has(utility)) return [];
          const where = `${relative(SRC, file)}: ${token}`;
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
  it('every transition and animation utility is gated on motion-ok: and timed by a token', () => {
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
    expect(css).toMatch(/:root\[data-motion='reduce'\]/);
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
