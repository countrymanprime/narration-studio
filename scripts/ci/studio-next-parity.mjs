#!/usr/bin/env node
// Checks the Studio Next parity tables: every test case of the mock (`docs/research/mockups/studio-next/tests/*.test.ts(x)`)
// is mapped to a real test or excused, and every ruling the audit relies on names a real test. Each page audit
// (SN-C31 to SN-C37) writes `docs/research/studio-next-parity-<area>.md` in the format below; this script reads every such doc,
// prints one line per problem and exits 1 on any. With no doc present it exits 0.
//
// Doc format
//
//   Mock files: a.test.tsx, b.test.ts
//
//   | mock file | mock case | status | real test | note |
//   | --- | --- | --- | --- | --- |
//   | a.test.tsx | the case title | ported | apps/ui/src/x.test.tsx::the real test name | |
//   | a.test.tsx | another title | mock-only | | Exercises the mock's own store, which the real app does not have. |
//
//   | ruling id | test |
//   | --- | --- |
//   | PR-3 | apps/desktop/x_test.go::TestSomething |
//
// - `Mock files:` lists the mock test files (basenames) the doc owns; a file named in two docs is a problem (one audit owns a file).
// - One case row per mock case. `mockCases(file)` lists them: each `it(`, `test(`, `it.each(...)(` and `test.each(...)(` call,
//   titled by its first string or template literal. A title built from a variable is the call's source text for the first argument.
//   The doc's rows for a file must equal that list (as a multiset), so a skipped test shows up as a missing row.
// - `status` is `ported`, `covered` (another real test covers it) or `mock-only`.
// - `ported` and `covered` name `path::test name` in `real test`: a repo-relative path to an existing file outside
//   `docs/research/mockups/` whose text contains the test name.
// - `mock-only` needs a `note` of at least ten characters saying why the case does not apply to the real app (the mock's own
//   store, its sample data, its fake DAW, the Companion page).
// - A ruling row's id must be in `docs/research/studio-next-ruling-index.md` with status `agreed` or `agreed-with-conditions`;
//   its test cell is checked like a real test above. A ruling id listed in two docs is a problem.
// - When `docs/research/mockups/studio-next/` is gone (after SN-C6), the mock-case and file-list checks are skipped.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseIndex } from './studio-next-rulings.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MOCK_DIR = 'docs/research/mockups/studio-next';
const RULING_INDEX = 'docs/research/studio-next-ruling-index.md';
const STATUSES = ['ported', 'covered', 'mock-only'];
const CASE_HEADER = ['mock file', 'mock case', 'status', 'real test', 'note'];
const RULING_HEADER = ['ruling id', 'test'];
const MIN_NOTE = 10;

const splitRow = (row) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll('\\|', '|'));
const unwrap = (cell) => cell.replace(/^`([^`]*)`$/, '$1');

/** Reads a parity doc: `{ mockFiles, caseRows, rulingRows, problems }`. Rows carry their 1-based `line`. */
export function parseParity(markdown) {
  const doc = { mockFiles: null, caseRows: [], rulingRows: [], problems: [] };
  const lines = markdown.split('\n');
  let table = null;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const at = i + 1;
    const declared = /^Mock files:\s*(.*)$/.exec(line);
    if (declared) {
      doc.mockFiles = declared[1].split(',').map((name) => unwrap(name.trim())).filter(Boolean);
      return;
    }
    if (!line.startsWith('|')) {
      table = null;
      return;
    }
    const cells = splitRow(line);
    if (!table) {
      const names = cells.map((cell) => cell.toLowerCase());
      if (names.join('|') === CASE_HEADER.join('|')) table = 'case';
      else if (names.join('|') === RULING_HEADER.join('|')) table = 'ruling';
      else table = 'other';
      return;
    }
    if (table === 'other' || cells.every((cell) => /^:?-+:?$/.test(cell))) return;
    const want = table === 'case' ? CASE_HEADER.length : RULING_HEADER.length;
    if (cells.length !== want) {
      doc.problems.push(`line ${at}: ${table} row has ${cells.length} cells, want ${want}`);
      return;
    }
    if (table === 'case') {
      const [file, title, status, real, note] = cells;
      doc.caseRows.push({ line: at, file: unwrap(file), title: unwrap(title), status: unwrap(status), real: unwrap(real), note });
    } else {
      doc.rulingRows.push({ line: at, id: unwrap(cells[0]), real: unwrap(cells[1]) });
    }
  });
  return doc;
}

const isIdent = (ch) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch);

/** Index just past the string, template or comment starting at `i`, or `i` when none starts there. */
function skipLiteral(src, i) {
  const ch = src[i];
  if (ch === '/' && src[i + 1] === '/') {
    const end = src.indexOf('\n', i);
    return end < 0 ? src.length : end;
  }
  if (ch === '/' && src[i + 1] === '*') {
    const end = src.indexOf('*/', i + 2);
    return end < 0 ? src.length : end + 2;
  }
  if (ch === "'" || ch === '"' || ch === '`') {
    let j = i + 1;
    while (j < src.length && src[j] !== ch) j += src[j] === '\\' ? 2 : 1;
    return j + 1;
  }
  return i;
}

/** Index just past the bracket group opening at `i` (`(`, `[`, `{` or `<`), string-aware. */
function skipGroup(src, i) {
  const close = { '(': ')', '[': ']', '{': '}', '<': '>' }[src[i]];
  let depth = 0;
  let j = i;
  while (j < src.length) {
    const lit = skipLiteral(src, j);
    if (lit !== j) {
      j = lit;
      continue;
    }
    if (src[j] === src[i]) depth += 1;
    else if (src[j] === close && !(close === '>' && src[j - 1] === '=')) {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
    j += 1;
  }
  return src.length;
}

const skipSpace = (src, i) => {
  let j = i;
  while (j < src.length && /\s/.test(src[j])) j += 1;
  return j;
};

const decode = (literal) => literal.slice(1, -1).replace(/\\(.)/g, '$1');

/** Titles of the `it`/`test` calls (including `.each`) of a mock test file's source, in file order. */
export function mockCases(source) {
  const titles = [];
  let i = 0;
  while (i < source.length) {
    const lit = skipLiteral(source, i);
    if (lit !== i) {
      i = lit;
      continue;
    }
    const word = /^(it|test)\b/.exec(source.slice(i, i + 5));
    if (!word || isIdent(source[i - 1]) || source[i - 1] === '.') {
      i += 1;
      continue;
    }
    let j = i + word[1].length;
    const each = source.startsWith('.each', j);
    if (each) {
      j = skipSpace(source, j + 5);
      if (source[j] === '<') j = skipSpace(source, skipGroup(source, j));
      if (source[j] !== '(') {
        i += 1;
        continue;
      }
      j = skipSpace(source, skipGroup(source, j));
    }
    if (source[j] !== '(') {
      i += 1;
      continue;
    }
    j = skipSpace(source, j + 1);
    const end = skipLiteral(source, j);
    if (end !== j && /['"`]/.test(source[j])) {
      titles.push(decode(source.slice(j, end)));
      i = end;
      continue;
    } else {
      // title built at run time: the first argument's source text
      let k = j;
      while (k < source.length && source[k] !== ',' && source[k] !== ')') k = '([{'.includes(source[k]) ? skipGroup(source, k) : k + 1;
      titles.push(source.slice(j, k).trim());
    }
    i = j + 1;
  }
  return titles;
}

const multiset = (list) => {
  const counts = new Map();
  for (const item of list) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
};

/** Problem for a `path::test name` cell, or null when it names a real test. */
function realTestProblem(cell, root) {
  const at = cell.indexOf('::');
  if (at < 0) return `real test "${cell}" is not path::test name`;
  const path = cell.slice(0, at).trim();
  const name = cell.slice(at + 2).trim();
  if (!path || !name) return `real test "${cell}" is not path::test name`;
  if (path.startsWith(`${MOCK_DIR.split('/').slice(0, 3).join('/')}/`)) return `real test ${path} is under docs/research/mockups/, the mock is not a real test`;
  const file = join(root, path);
  if (!existsSync(file)) return `real test file ${path} does not exist`;
  if (!readFileSync(file, 'utf8').includes(name)) return `real test "${name}" is not in ${path}`;
  return null;
}

/**
 * Checks parsed docs (`[{ name, doc }]`) against the repo at `root`.
 * Returns `{ problems, mapped, excused, skipped }`.
 */
export function check(docs, { root = ROOT } = {}) {
  const problems = [];
  const add = (doc, line, message) => problems.push(`${doc.name}${line ? `:${line}` : ''}: ${message}`);
  let mapped = 0;
  let excused = 0;
  const mockRoot = join(root, MOCK_DIR);
  const mockPresent = existsSync(mockRoot);
  const skipped = mockPresent ? [] : ['mock-case and file-list checks (docs/research/mockups/studio-next/ is gone)'];

  let rulings = null;
  const indexFile = join(root, RULING_INDEX);
  if (docs.some(({ doc }) => doc.rulingRows.length) && existsSync(indexFile)) rulings = new Map(parseIndex(readFileSync(indexFile, 'utf8')).map((row) => [row.id, row]));

  const fileOwner = new Map();
  const rulingOwner = new Map();
  for (const { name, doc } of docs) {
    const d = { name };
    for (const message of doc.problems) add(d, 0, message);
    for (const row of doc.caseRows) {
      if (!STATUSES.includes(row.status)) {
        add(d, row.line, `status "${row.status}" is not ${STATUSES.join(', ')}`);
        continue;
      }
      if (row.status === 'mock-only') {
        excused += 1;
        if (row.note.length < MIN_NOTE) add(d, row.line, `mock-only case "${row.title}" needs a note of at least ${MIN_NOTE} characters saying why it does not apply`);
      } else {
        mapped += 1;
        const problem = realTestProblem(row.real, root);
        if (problem) add(d, row.line, `${row.status} case "${row.title}": ${problem}`);
      }
    }
    for (const row of doc.rulingRows) {
      const entry = rulings?.get(row.id);
      if (!rulings) add(d, row.line, `ruling ${row.id}: ${RULING_INDEX} does not exist`);
      else if (!entry) add(d, row.line, `ruling ${row.id} is not in ${RULING_INDEX}`);
      else if (entry.status !== 'agreed' && entry.status !== 'agreed-with-conditions') add(d, row.line, `ruling ${row.id} is ${entry.status}, only agreed rulings need a test`);
      const problem = realTestProblem(row.real, root);
      if (problem) add(d, row.line, `ruling ${row.id}: ${problem}`);
      if (rulingOwner.has(row.id)) add(d, row.line, `ruling ${row.id} is also listed in ${rulingOwner.get(row.id)}`);
      else rulingOwner.set(row.id, name);
    }
    if (!mockPresent) continue;
    if (doc.mockFiles === null) add(d, 0, 'no "Mock files:" line');
    for (const file of doc.mockFiles ?? []) {
      if (fileOwner.has(file)) add(d, 0, `mock file ${file} is also owned by ${fileOwner.get(file)}`);
      else fileOwner.set(file, name);
      const path = join(mockRoot, 'tests', file);
      if (!existsSync(path)) {
        add(d, 0, `mock file ${file} does not exist in ${MOCK_DIR}/tests`);
        continue;
      }
      const want = multiset(mockCases(readFileSync(path, 'utf8')));
      const have = multiset(doc.caseRows.filter((row) => row.file === file).map((row) => row.title));
      for (const [title, count] of want) if ((have.get(title) ?? 0) < count) add(d, 0, `${file}: mock case "${title}" has no row`);
      for (const [title, count] of have) if (count > (want.get(title) ?? 0)) add(d, 0, `${file}: row for "${title}" but the mock has no such case`);
    }
    for (const row of doc.caseRows) {
      if (!(doc.mockFiles ?? []).includes(row.file)) add(d, row.line, `row names ${row.file}, which is not in the Mock files line`);
    }
  }
  return { problems, mapped, excused, skipped };
}

function loadDocs(root) {
  const dir = join(root, 'docs/research');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^studio-next-parity-.+\.md$/.test(name))
    .sort()
    .map((name) => ({ name: `docs/research/${name}`, doc: parseParity(readFileSync(join(dir, name), 'utf8')) }));
}

function main(root = ROOT) {
  const docs = loadDocs(root);
  const { problems, mapped, excused, skipped } = check(docs, { root });
  for (const line of skipped) console.log(`skipped ${line}`);
  for (const problem of problems) console.error(problem);
  console.log(`${docs.length} docs, ${mapped} cases mapped, ${excused} excused`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
