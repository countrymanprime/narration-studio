// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

// Owner rule (#2251): nothing in the app is "experimental". Once a project is linked to a DAW, what the DAW reports is what the narrator
// can use; a capability the DAW lacks says so in a plain sentence naming the DAW. So no word the narrator can read says "experimental":
// not a string, a template or JSX text in the app's sources or the public demo's, and not a line of the how-to guides. The one exception
// is the capability level's wire value, the bare string 'experimental', which a comparison or an enum list may name.

const uiRoot = join(__dirname, '..');
const repoRoot = join(uiRoot, '..', '..', '..');
const WORD = /experimental/i;
/** The wire level, and the only literal allowed to carry the word. */
const WIRE_LEVEL = 'experimental';
const SOURCE = /\.tsx?$/;
const NOT_A_SOURCE = /\.(test|spec)\.tsx?$|\.d\.ts$/;
/** Wire shapes, not words: the level enum lives here. */
const WIRE_DIRS = [join('src', 'api', 'schemas'), join('src', 'api', 'contracts')];

function sourcesUnder(root: string, skip: (path: string) => boolean = () => false): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(path);
      } else if (SOURCE.test(entry.name) && !NOT_A_SOURCE.test(entry.name) && !skip(path)) out.push(path);
    }
  };
  walk(root);
  return out;
}

/** Every string literal, template piece and JSX text in `text` that carries the word, other than the wire level itself. */
function wordsIn(fileName: string, text: string): string[] {
  const file = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    let value: string | undefined;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) value = node.text;
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) value = node.text;
    else if (ts.isJsxText(node)) value = node.text;
    if (value !== undefined && value !== WIRE_LEVEL && WORD.test(value)) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart());
      hits.push(`${fileName}:${line + 1}: ${value.trim().slice(0, 120)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return hits;
}

const rel = (path: string) => relative(repoRoot, path).split(sep).join('/');

describe('no word the narrator reads says "experimental"', () => {
  test('the scan finds the word in a label, a template and JSX text, and passes the wire level', () => {
    expect(wordsIn('a.tsx', "const label = 'Experimental DAW actions';")).toHaveLength(1);
    expect(wordsIn('a.tsx', 'const label = `Recording in ${daw} is experimental`;')).toHaveLength(1);
    expect(wordsIn('a.tsx', 'const node = <span>Experimental. </span>;')).toHaveLength(1);
    expect(wordsIn('a.ts', "if (support.level === 'experimental') go(); const levels = ['supported', 'experimental'];")).toEqual([]);
    expect(wordsIn('a.ts', '// an experimental comment is not read by the narrator\nconst x = 1;')).toEqual([]);
  });

  test('the app and the public demo', () => {
    const app = sourcesUnder(join(uiRoot, 'src'), (path) => WIRE_DIRS.some((dir) => relative(uiRoot, path).startsWith(dir)));
    const demo = sourcesUnder(join(repoRoot, 'src', 'web', 'demo', 'src'));
    const hits = [...app, ...demo].flatMap((path) => wordsIn(rel(path), readFileSync(path, 'utf8')));
    expect(hits).toEqual([]);
  });

  test('the how-to guides', () => {
    const dir = join(repoRoot, 'docs', 'guides', 'using-the-app');
    const hits = readdirSync(dir)
      .filter((name) => name.endsWith('.md'))
      .flatMap((name) =>
        readFileSync(join(dir, name), 'utf8')
          .split('\n')
          .flatMap((line, i) => (WORD.test(line) ? [`${rel(join(dir, name))}:${i + 1}: ${line.trim().slice(0, 120)}`] : [])),
      );
    expect(hits).toEqual([]);
  });
});
