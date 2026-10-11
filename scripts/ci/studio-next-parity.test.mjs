import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { check, mockCases, parseParity } from './studio-next-parity.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'studio-next-parity.mjs');
const HEAD = '| mock file | mock case | status | real test | note |\n| --- | --- | --- | --- | --- |\n';
const MOCK_SRC = `import { it, test, describe } from 'vitest'
// it('commented out', () => {})
describe('x', () => {
  it('first case', () => {})
  test("second 'case'", () => {})
  it.each<[string]>([['a'], ['b']])('each %s case', () => {})
  test.each([[1]])(\`template \${1} case\`, () => {})
  it(TITLE_VAR, () => {})
  const s = 'it("in a string")'
})
`;

/** A scratch repo with a mock test file, a real test file and a ruling index. */
function repo({ mock = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'parity-'));
  mkdirSync(join(root, 'docs/research'), { recursive: true });
  mkdirSync(join(root, 'apps/ui'), { recursive: true });
  writeFileSync(join(root, 'apps/ui/real.test.ts'), "it('real name', () => {})\n");
  writeFileSync(
    join(root, 'docs/research/studio-next-ruling-index.md'),
    '| id | section | status | ruling | slice | test |\n| --- | --- | --- | --- | --- | --- |\n| PR-1 | s | agreed | a | SNB-1 | |\n| PR-2 | s | rejected | b | none | |\n| PR-3 | s | agreed-with-conditions | c | SNB-1 | |\n',
  );
  if (mock) {
    mkdirSync(join(root, 'docs/research/mockups/studio-next/tests'), { recursive: true });
    writeFileSync(join(root, 'docs/research/mockups/studio-next/tests/a.test.ts'), "it('one', () => {})\nit('two', () => {})\n");
  }
  return root;
}
const run = (docs, root) => check(docs.map((markdown, i) => ({ name: `doc${i}.md`, doc: parseParity(markdown) })), { root });
const doc = (rows, files = 'a.test.ts') => `Mock files: ${files}\n\n${HEAD}${rows.join('\n')}\n`;
const ok = [
  '| a.test.ts | one | ported | apps/ui/real.test.ts::real name | |',
  '| a.test.ts | two | mock-only | | The mock keeps its own store. |',
];

test('parses-the-case-table', () => {
  const parsed = parseParity(doc(ok, 'a.test.ts, b.test.tsx'));
  assert.deepEqual(parsed.mockFiles, ['a.test.ts', 'b.test.tsx']);
  assert.deepEqual(parsed.caseRows.map((r) => [r.file, r.title, r.status]), [['a.test.ts', 'one', 'ported'], ['a.test.ts', 'two', 'mock-only']]);
  assert.equal(parsed.caseRows[0].real, 'apps/ui/real.test.ts::real name');
  assert.equal(run([doc(['| a.test.ts | one | maybe | | |', ok[1]])], repo()).problems.some((p) => p.includes('status "maybe"')), true);
});

test('ported-and-covered-name-a-real-test', () => {
  const root = repo();
  const bad = (cell, status = 'ported') => run([doc([`| a.test.ts | one | ${status} | ${cell} | |`, ok[1]])], root).problems;
  assert.deepEqual(bad('apps/ui/real.test.ts::real name'), []);
  assert.deepEqual(bad('apps/ui/real.test.ts::real name', 'covered'), []);
  assert.match(bad('apps/ui/nope.test.ts::real name')[0], /does not exist/);
  assert.match(bad('apps/ui/real.test.ts::other name')[0], /not in apps\/ui\/real.test.ts/);
  assert.match(bad('apps/ui/real.test.ts')[0], /not path::test name/);
  assert.match(bad('docs/research/mockups/studio-next/tests/a.test.ts::one')[0], /under docs\/research\/mockups/);
  assert.match(bad('apps/ui/real.test.ts::real name', 'covered').concat(bad('', 'covered'))[0], /not path::test name/);
});

test('mock-only-needs-a-reason', () => {
  const root = repo();
  const row = (note) => run([doc([ok[0], `| a.test.ts | two | mock-only | | ${note} |`])], root);
  assert.deepEqual(row('its fake DAW').problems, []);
  assert.match(row('').problems[0], /needs a note/);
  assert.match(row('too short').problems[0], /needs a note/);
  assert.equal(row('its fake DAW').excused, 1);
});

test('mockCases lists it, test and each calls by their first string or template literal', () => {
  // title built at run time: TITLE_VAR is the call's source text
  assert.deepEqual(mockCases(MOCK_SRC), ['first case', "second 'case'", 'each %s case', 'template ${1} case', 'TITLE_VAR']);
});

test('every-mock-case-has-a-row', () => {
  const root = repo();
  assert.match(run([doc([ok[0]])], root).problems[0], /mock case "two" has no row/);
  const extra = '| a.test.ts | three | mock-only | | the mock has it only |';
  assert.match(run([doc([...ok, extra])], root).problems[0], /row for "three" but the mock has no such case/);
  assert.deepEqual(run([doc(ok)], root).problems, []);
});

test('file-lists-are-declared', () => {
  const root = repo();
  assert.match(run([`${HEAD}${ok.join('\n')}\n`], root).problems.join('\n'), /no "Mock files:" line/);
  assert.match(run([doc(ok), doc(ok)], root).problems.join('\n'), /a.test.ts is also owned by doc0.md/);
  assert.match(run([doc(ok, 'a.test.ts, gone.test.ts')], root).problems.join('\n'), /gone.test.ts does not exist/);
  const undeclared = [...ok, '| b.test.ts | x | mock-only | | the mock has it only |'];
  assert.match(run([doc(undeclared)], root).problems.join('\n'), /b.test.ts, which is not in the Mock files line/);
});

test('ruling-rows', () => {
  const root = repo();
  const rulings = (rows, extra = ok) => `${doc(extra)}\n| ruling id | test |\n| --- | --- |\n${rows.join('\n')}\n`;
  assert.deepEqual(run([rulings(['| PR-1 | apps/ui/real.test.ts::real name |', '| PR-3 | apps/ui/real.test.ts::real name |'])], root).problems, []);
  const problems = run([rulings(['| PR-2 | apps/ui/real.test.ts::real name |', '| PR-9 | apps/ui/real.test.ts::real name |', '| PR-1 | apps/ui/real.test.ts::nope |'])], root).problems.join('\n');
  assert.match(problems, /PR-2 is rejected/);
  assert.match(problems, /PR-9 is not in/);
  assert.match(problems, /PR-1: real test "nope"/);
  const twice = run([rulings(['| PR-1 | apps/ui/real.test.ts::real name |']), '| ruling id | test |\n| --- | --- |\n| PR-1 | apps/ui/real.test.ts::real name |\n'], root).problems;
  assert.match(twice.join('\n'), /PR-1 is also listed in doc0.md/);
});

test('skips-when-the-mock-is-gone', () => {
  const root = repo({ mock: false });
  const result = run([doc([ok[0]]), doc([ok[0]])], root);
  assert.deepEqual(result.problems, []);
  assert.equal(result.skipped.length, 1);
  assert.match(run([doc(['| a.test.ts | one | ported | apps/ui/nope.ts::x | |'])], root).problems[0], /does not exist/);
});

test('cli: the repo with no parity doc passes and a bad doc fails with a summary', () => {
  const out = execFileSync('node', [SCRIPT], { encoding: 'utf8' });
  assert.match(out, /^\d+ docs, \d+ cases mapped, \d+ excused$/m);
  const root = repo();
  writeFileSync(join(root, 'docs/research/studio-next-parity-x.md'), doc([ok[0]]));
  const script = join(root, 'scripts/ci');
  mkdirSync(script, { recursive: true });
  for (const name of ['studio-next-parity.mjs', 'studio-next-rulings.mjs']) execFileSync('cp', [join(dirname(SCRIPT), name), script]);
  assert.throws(() => execFileSync('node', [join(script, 'studio-next-parity.mjs')], { encoding: 'utf8', stdio: 'pipe' }), (error) => {
    assert.equal(error.status, 1);
    assert.match(error.stderr, /mock case "two" has no row/);
    assert.match(error.stdout, /1 docs, 1 cases mapped, 0 excused/);
    return true;
  });
  rmSync(root, { recursive: true });
});
