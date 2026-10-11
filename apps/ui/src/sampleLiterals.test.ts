// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, test } from 'vitest';
import { aliceChapterSeeds, WIRE_ENTITIES } from './api/mockFixtures';
import { sampleSpeakers } from './fixtures/speakers';

// ADR 0770 / the Studio Next domain PRD: sample data lives in `src/fixtures/` (and the mock host under `src/api/`), never as a
// literal in a component or a hook. This scan counts, per non-test, non-story file under `src/components/` and `src/hooks/`, the
// string literals that equal a sample chapter title, chapter subtitle or speaker name those two places hold. A file's count
// may only go down, in the style of rawNatives.test.ts (ADR 0053): a ceiling above the real count fails, so the entry is
// lowered (deleted at zero) in the same change, and a file with a literal and no entry fails. The scan reports; it edits nothing.
const CEILING: Record<string, number> = {
  // Test and story data that SN-O62 (#1346) and SN-Q41 (#1324) wrote as component-side fixtures; they move to src/fixtures/ with #1119.
  'src/components/booth/reading/fixture.ts': 3,
  // Component-side fixtures of the side panel (SN-O63/SN-O64) and the script document (SN-E3); they move to src/fixtures/ with #1119.
  'src/components/booth/side/fixture.ts': 2,
  'src/components/editing/script/scriptFixtures.ts': 1,
  'src/components/proof/notes/testNotes.ts': 5,
  // Component-side fixture of the bookmark ribbon (SN-B62); it moves to src/fixtures/ with #1119.
  'src/components/script/bookmarks/ui/bookmarkFixtures.ts': 3,
};

const uiRoot = join(__dirname, '..');
const SCANNED_DIRS = [join('src', 'components'), join('src', 'hooks')];
const SOURCE = /\.tsx?$/;
const NOT_SCANNED = /\.(test|stories)\.tsx?$/;

const sampleValues = new Set<string>([
  ...aliceChapterSeeds.flatMap((seed) => [seed.title, seed.subtitle]),
  ...sampleSpeakers.map((speaker) => speaker.name),
  ...WIRE_ENTITIES.map((entity) => entity.canonical_name),
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE.test(entry.name) ? [path] : [];
  });
}

// A literal counts once, whether it is a string, a no-substitution template or a JSX attribute string. JSX text between tags
// is not a literal and is not counted. Read with the TypeScript parser, so a comment that names a sample is fine.
export function countSampleLiterals(source: string, samples: ReadonlySet<string> = sampleValues, fileName = 'probe.tsx'): number {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX);
  let count = 0;
  const visit = (node: ts.Node): void => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && samples.has(node.text)) count++;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return count;
}

export function scannedFiles(root: string): string[] {
  return SCANNED_DIRS.flatMap((dir) => {
    try {
      return sourceFiles(join(root, dir));
    } catch {
      return [];
    }
  })
    .map((file) => relative(root, file).split(sep).join('/'))
    .filter((file) => !NOT_SCANNED.test(file));
}

function counts(root: string): Record<string, number> {
  const found: Record<string, number> = {};
  for (const file of scannedFiles(root)) {
    const count = countSampleLiterals(readFileSync(join(root, file), 'utf8'), sampleValues, file);
    if (count > 0) found[file] = count;
  }
  return found;
}

describe('sample literals stay in fixtures (falling ratchet)', () => {
  const found = counts(uiRoot);

  test('the sample set holds chapter titles, subtitles and speaker names', () => {
    for (const value of ['Chapter 1', 'Down the Rabbit-Hole', 'Alice', 'White Rabbit']) expect(sampleValues.has(value)).toBe(true);
  });

  test('no file gains a sample chapter title or speaker name literal', () => {
    const grew = Object.entries(found).filter(([file, count]) => count > (CEILING[file] ?? 0));
    expect(grew, 'take the sample from src/fixtures/ (makeChapters, sampleSpeakers); raising a ceiling needs a reason in the pull request').toEqual([]);
  });

  test('a ceiling above the real count is lowered or deleted', () => {
    const stale = Object.entries(CEILING).filter(([file, allowed]) => (found[file] ?? 0) < allowed);
    expect(stale, 'a file lost a sample literal: lower its ceiling (delete the entry at zero)').toEqual([]);
  });
});

describe('the scan sees each way of writing a sample (a bad fixture per form)', () => {
  const samples = new Set(['Alice', 'Chapter 1']);
  test.each([
    ['a string', "const a = 'Alice';", 1],
    ['a double-quoted string', 'const a = "Chapter 1";', 1],
    ['a template without substitutions', 'const a = `Alice`;', 1],
    ['a JSX attribute', 'const a = <Row speaker="Alice" />;', 1],
    ['two in one file', "const a = ['Alice', 'Chapter 1'];", 2],
  ])('%s', (_name, source, expected) => {
    expect(countSampleLiterals(source, samples)).toBe(expected);
  });

  test.each([
    ['a comment', '// Alice speaks\nconst a = 1;'],
    ['JSX text', 'const a = <p>Alice</p>;'],
    ['a longer string', "const a = 'Alice in Wonderland';"],
    ['a template with a substitution', 'const a = `Alice ${x}`;'],
  ])('ignores %s', (_name, source) => {
    expect(countSampleLiterals(source, samples)).toBe(0);
  });
});

describe('the scan skips what may hold samples', () => {
  const root = mkdtempSync(join(tmpdir(), 'sample-literals-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const put = (file: string) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "export const a = 'Alice';\n");
  };

  test('tests, stories, fixtures and api are not scanned; components and hooks are', () => {
    for (const file of [
      'src/components/x/Page.tsx',
      'src/components/x/Page.test.tsx',
      'src/components/x/Page.stories.tsx',
      'src/components/x/model.test.ts',
      'src/hooks/useThing.ts',
      'src/hooks/useThing.test.ts',
      'src/fixtures/chapters.ts',
      'src/api/mockFixtures.ts',
    ])
      put(file);
    expect(scannedFiles(root).sort()).toEqual(['src/components/x/Page.tsx', 'src/hooks/useThing.ts']);
  });

  test.each(['src/components/x/Page.test.tsx', 'src/components/x/Page.stories.tsx', 'src/fixtures/chapters.ts', 'src/api/mockFixtures.ts'])(
    'skips %s',
    (file) => {
      expect(scannedFiles(root)).not.toContain(file);
    },
  );
});
