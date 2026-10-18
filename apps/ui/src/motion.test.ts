// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXEMPT, findMotionViolations } from './motionScan';

// docs/design/design-system.md#motion: every transition and animation in apps/ui/src is a `motion-ok:` utility (styles.css's custom
// variant: no `prefers-reduced-motion: reduce` and no `data-motion="reduce"`), reads a motion token rather than a literal duration,
// and nothing loops. Screenshots cannot see any of this (tests/visual/helpers/settle.ts freezes motion and the atlas runs with reduced
// motion), so this scan is what stops an unguarded `transition` coming back. The Playwright spec tests/visual/motion.spec.ts proves
// what the browser does with the classes.

const SRC = __dirname;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'api' || name === 'fixtures' ? [] : sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && name !== 'motionScan.ts' && !/\.(test|stories)\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('findMotionViolations (the scan itself)', () => {
  it('passes guarded, tokenised classes', () => {
    const ok = `<div className="motion-ok:transition-colors motion-ok:duration-(--motion-fast) motion-ok:ease-(--ease-standard) data-[swiping]:duration-0" />`;
    expect(findMotionViolations('a.tsx', ok)).toEqual([]);
    expect(findMotionViolations('a.tsx', `<i className="motion-ok:animate-spin transition-none animate-none" />`)).toEqual([]);
    expect(findMotionViolations('a.tsx', `const A = 'transition-[transform] duration-200 motion-reduce:transition-none';`).map((v) => v.why)).toEqual([
      'a literal duration; use `duration-(--motion-fast|base|slow)`',
    ]);
  });

  it('flags an unguarded transition, a literal duration, a loop and an inline transition', () => {
    const whys = (source: string) => findMotionViolations('a.tsx', source).map((v) => v.why);
    expect(whys(`<div className="transition" />`)).toEqual(['has no `motion-ok:` (or `motion-reduce:`) partner']);
    expect(whys(`<div className="motion-safe:transition-colors" />`)).toHaveLength(1);
    expect(whys(`<div className="motion-ok:duration-300" />`)).toEqual(['a literal duration; use `duration-(--motion-fast|base|slow)`']);
    expect(whys(`<div className="motion-ok:animate-pulse" />`)).toEqual(['a loop; use one `changed-highlight` fade or a static state']);
    expect(whys(`<div className="motion-ok:animate-[x_1s_ease_infinite]" />`)).toHaveLength(2);
    expect(whys(`<i className="animate-spin" />`)).toHaveLength(2);
    expect(whys(`el.style.transition = 'transform 300ms';`)).toHaveLength(1);
    expect(whys(`el.style.transition = eased ? '' : 'none';`)).toEqual([]);
    expect(whys(`el.animate({ opacity: [0, 1] }, 200);`)).toEqual(['an inline animation']);
  });

  it('ignores prose in comments', () => {
    expect(findMotionViolations('a.tsx', `// the page transition is not animated\n/* a transition here */\nconst x = 1;`)).toEqual([]);
  });
});

describe('apps/ui/src motion', () => {
  const files = sourceFiles(SRC).map((path) => ({ file: relative(SRC, path).replaceAll('\\', '/'), source: readFileSync(path, 'utf8') }));

  it('has no transition or animation without a `motion-ok:` guard, a motion token and a reason to loop', () => {
    const problems = files.flatMap(({ file, source }) => findMotionViolations(file, source)).map((v) => `${v.file}:${v.line}  ${v.token}  ${v.why}`);
    expect(problems).toEqual([]);
  });

  it('keeps every exemption alive and explained', () => {
    for (const entry of EXEMPT) {
      expect(entry.reason.length, `${entry.file} ${entry.token}: say why`).toBeGreaterThan(20);
      const source = files.find(({ file }) => file === entry.file)?.source;
      expect(source?.includes(entry.token), `${entry.file} no longer holds ${entry.token}: delete the exemption`).toBe(true);
    }
  });

  it('defines every motion token the classes read', () => {
    const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
    for (const name of [
      '--motion-fast',
      '--motion-base',
      '--motion-slow',
      '--motion-highlight',
      '--ease-standard',
      '--ease-enter',
      '--ease-exit',
      '--motion-shift',
    ]) {
      expect(css, name).toMatch(new RegExp(`^\\s*${name}:`, 'm'));
    }
    expect(css).toContain('@custom-variant motion-ok');
    const used = new Set(files.flatMap(({ source }) => [...source.matchAll(/\(--(motion-[a-z]+|ease-[a-z]+)\)/g)].map((match) => `--${match[1]}`)));
    for (const name of used) expect(css, `${name} is read but not defined`).toMatch(new RegExp(`^\\s*${name}:`, 'm'));
  });
});
