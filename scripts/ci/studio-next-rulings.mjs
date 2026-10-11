#!/usr/bin/env node
// Builds and checks the Studio Next ruling index (`docs/research/studio-next-ruling-index.md`).
//
// The index has one row per ruling line of `docs/research/mockups/studio-next/research/repo-compare-decisions.md`:
// every `- ` bullet and every prose line under a heading (a numbered run such as "1 voice following, 2 auto-stop" is one
// row). Columns: id, section, status, ruling text, slice, test. `--write` regenerates the id, section, status and text
// columns and keeps the hand-filled slice and test columns (and a ` => pointer` suffix on the text); without it the
// script checks the index against the file and the repo and exits 1 with one line per problem.
//
// Ids are `<section code>-<n>`, the section code being the `##` heading's entry in H2_SECTIONS. The first write numbers
// a section's lines in file order. After that an id is never reused or renumbered: a bullet inserted anywhere gets
// the section's next free number, a reworded bullet keeps its row (rows and lines left unmatched by text are paired in
// order within the section), and a removed bullet drops its row.
//
// Status comes from the nearest `###` heading, or from the `##` heading when a section has no `###`. A heading the
// tables below do not know fails loudly: there is no default.
//
// Not in the index: the register's DQ-1..DQ-18 and SN0-Q1..Q9 rulings. They are not bullets of the decisions file;
// the cutover parity audit and SNC-Q4 check them against the ADRs.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Flip to true in SNC-4: an agreed row must then name a test. */
const ENFORCE_TEST_NAMES = false;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SOURCE = 'docs/research/mockups/studio-next/research/repo-compare-decisions.md';
export const INDEX = 'docs/research/studio-next-ruling-index.md';
export const STATUSES = ['agreed', 'agreed-with-conditions', 'deferred', 'rejected', 'maybe', 'need-mock', 'unclear'];
const POINTER = ' => ';

// `###` headings (lowercased, parentheses removed) to a status; first match wins.
const H3_STATUS = [
  [/^agreed with conditions/, 'agreed-with-conditions'],
  [/^agreed/, 'agreed'],
  [/^rejected/, 'rejected'],
  [/^maybe/, 'maybe'],
  [/^deferred/, 'deferred'],
  [/^need to see a mock first/, 'need-mock'],
  [/^unclear/, 'unclear'],
  [/^not clear/, 'unclear'],
];
// `##` headings: the code that prefixes ids and, for a section whose lines sit directly under it, their status.
const H2_SECTIONS = [
  [/^owner rulings from the repo comparison$/, 'TOP', null],
  [/^repo comparison: owner rulings/, 'SB', 'agreed'],
  [/^production page rulings/, 'PR', null],
  [/^schedule page rulings/, 'SC', null],
  [/^booth rulings/, 'BO', null],
  [/^proof rulings/, 'PF', null],
  [/^pickups and speech check rulings/, 'PK', null],
  [/^companion ruling/, 'CO', 'deferred'],
  [/^daw state rulings/, 'DS', 'agreed'],
  [/^takes, restarts, punch and roll/, 'TK', 'agreed'],
  [/^owner follow-up on takes and audacity/, 'TA', 'agreed'],
  [/^conflicts table/, 'CF', 'agreed'],
  [/^editing page/, 'ED', 'agreed'],
  [/^sketch review/, 'SK', 'agreed'],
  [/^maybe-list pass/, 'ML', 'maybe'],
  [/^small decisions/, 'SD', 'agreed'],
  [/^story bible extraction/, 'EX', 'agreed'],
  [/^extraction tools/, 'DI', 'agreed'],
];
// A line that opens with one of these is an open question, whatever heading it sits under.
const LINE_STATUS = [
  [/^treated as still open/i, 'unclear'],
  [/^open:/i, 'unclear'],
];

const plain = (heading) => heading.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Turns the decisions file into ruling lines `{ code, section, status, text }` in file order. Throws on an unknown heading. */
export function parseSource(markdown) {
  const lines = [];
  let h2 = null;
  let h3 = null;
  let fence = false;
  for (const [index, raw] of markdown.split('\n').entries()) {
    const line = raw.trimEnd();
    if (line.startsWith('```')) fence = !fence;
    if (fence || !line.trim()) continue;
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (level === 1) continue;
      if (level === 2) {
        const found = H2_SECTIONS.find(([pattern]) => pattern.test(plain(heading[2])));
        if (!found) throw new Error(`${SOURCE}:${index + 1}: unknown section heading "${heading[2]}"`);
        h2 = { title: heading[2], code: found[1], status: found[2] };
        h3 = null;
      } else if (level === 3) {
        const found = H3_STATUS.find(([pattern]) => pattern.test(plain(heading[2])));
        if (!found) throw new Error(`${SOURCE}:${index + 1}: unknown status heading "${heading[2]}"`);
        h3 = { title: heading[2], status: found[1] };
      } else throw new Error(`${SOURCE}:${index + 1}: unexpected heading depth "${line}"`);
      continue;
    }
    if (!h2) throw new Error(`${SOURCE}:${index + 1}: text before any section heading`);
    const text = line.replace(/^- /, '').trim();
    const status = LINE_STATUS.find(([pattern]) => pattern.test(text))?.[1] ?? h3?.status ?? h2.status;
    if (!status) throw new Error(`${SOURCE}:${index + 1}: no status heading above "${text.slice(0, 60)}"`);
    lines.push({ code: h2.code, section: h3 ? `${h2.title} > ${h3.title}` : h2.title, status, text });
  }
  return lines;
}

const escapeCell = (value) => value.replaceAll('|', '\\|');
const splitRow = (row) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll('\\|', '|'));

const HEADER = ['id', 'section', 'status', 'ruling', 'slice', 'test'];

/** Reads the rows of the index table. */
export function parseIndex(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = splitRow(line);
    if (cells.length !== HEADER.length) throw new Error(`index row has ${cells.length} cells, want ${HEADER.length}: ${line.slice(0, 80)}`);
    if (cells[0] === 'id' || /^-+$/.test(cells[0])) continue;
    const [id, section, status, ruling, slice, test] = cells;
    const at = ruling.indexOf(POINTER);
    rows.push({ id, section, status, text: at < 0 ? ruling : ruling.slice(0, at), pointer: at < 0 ? '' : ruling.slice(at + POINTER.length), slice, test });
  }
  return rows;
}

const idNumber = (id) => Number(id.slice(id.lastIndexOf('-') + 1));

/** Matches source lines to the existing rows (see the header for the rule) and returns the new rows. */
export function buildRows(lines, existing) {
  const taken = new Set();
  const matched = lines.map((line) => {
    const row = existing.find((candidate) => !taken.has(candidate) && candidate.text === line.text && candidate.id.startsWith(`${line.code}-`));
    if (row) taken.add(row);
    return row;
  });
  lines.forEach((line, i) => {
    if (matched[i]) return;
    const row = existing.find((candidate) => !taken.has(candidate) && candidate.id.startsWith(`${line.code}-`) && !lines.some((other) => other.text === candidate.text));
    if (row) {
      taken.add(row);
      matched[i] = row;
    }
  });
  const next = new Map();
  for (const row of existing) next.set(row.id.slice(0, row.id.lastIndexOf('-')), Math.max(next.get(row.id.slice(0, row.id.lastIndexOf('-'))) ?? 0, idNumber(row.id)));
  return lines.map((line, i) => {
    const row = matched[i];
    let id = row?.id;
    if (!id) {
      const n = (next.get(line.code) ?? 0) + 1;
      next.set(line.code, n);
      id = `${line.code}-${n}`;
    }
    const defaultSlice = line.status === 'deferred' || line.status === 'rejected' ? 'none' : '';
    return { id, section: line.section, status: line.status, text: line.text, pointer: row?.pointer ?? '', slice: row?.slice ?? defaultSlice, test: row?.test ?? '' };
  });
}

const INTRO = `# Studio Next ruling index

A working document built from \`${SOURCE}\`, deleted with the mock at cutover (SNC-6), so each row carries the ruling's full text. One row per ruling line of that file; \`deferred\` and \`rejected\` rows get no successor PRD (SNC-Q3). The register's rulings DQ-1 to DQ-18 and SN0-Q1 to Q9 are not lines of that file and are not here; the parity audit and SNC-Q4 check them against the ADRs.

Regenerate with \`node scripts/ci/studio-next-rulings.mjs --write\`: it rewrites the id, section, status and ruling columns and keeps \`slice\` and \`test\`. Fill those two by hand: \`slice\` is the owning slice id from a \`docs/prds/studio-next-*.prd.md\` Slices table (\`none\` for a deferred or rejected row), \`test\` is the name of the test in the real app that proves the ruling. A deferred or rejected row ends its ruling text with \` => \` and a pointer to the ADR, PRD or register row that records it.

`;

export function renderIndex(rows) {
  const out = [`${INTRO.trimEnd()}\n`, `| ${HEADER.join(' | ')} |`, `| ${HEADER.map(() => '---').join(' | ')} |`];
  for (const row of rows) {
    const ruling = row.text + (row.pointer ? POINTER + row.pointer : '');
    out.push(`| ${[row.id, row.section, row.status, ruling, row.slice, row.test].map(escapeCell).join(' | ')} |`);
  }
  return `${out.join('\n')}\n`;
}

/** Slice ids of every `docs/prds/studio-next-*.prd.md` Slices table. */
export function parseSliceIds(prdMarkdown) {
  const ids = [];
  let inSlices = false;
  for (const line of prdMarkdown.split('\n')) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) inSlices = /^slices$/i.test(heading[1].trim());
    else if (inSlices) {
      const id = /^\|\s*([A-Z][A-Z0-9]*-\d+)\s*\|/.exec(line);
      if (id) ids.push(id[1]);
    }
  }
  return ids;
}

/**
 * Problems with the index. `sliceIds` is a Set; `testExists(name)` says whether a test name is found in the repo.
 * Returns `{ errors, agreedWithoutTest, needPointer }`.
 */
export function checkIndex(lines, rows, { sliceIds, testExists }) {
  const errors = [];
  const byText = new Map(rows.map((row) => [row.text, row]));
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) errors.push(`duplicate id ${row.id}`);
    seen.add(row.id);
  }
  for (const line of lines) {
    if (!byText.has(line.text)) errors.push(`no index row for bullet (rerun --write): ${line.text}`);
  }
  const sourceByText = new Map(lines.map((line) => [line.text, line]));
  for (const row of rows) {
    if (!sourceByText.has(row.text)) errors.push(`${row.id}: ruling text differs from the source (rerun --write): ${row.text}`);
    const source = sourceByText.get(row.text);
    if (source && source.status !== row.status) errors.push(`${row.id}: status ${row.status}, heading says ${source.status}`);
    if (!STATUSES.includes(row.status)) errors.push(`${row.id}: unknown status "${row.status}"`);
    if (row.slice && row.slice !== 'none' && !sliceIds.has(row.slice)) errors.push(`${row.id}: slice "${row.slice}" is in no studio-next PRD Slices table`);
    if (row.test && !testExists(row.test)) errors.push(`${row.id}: test "${row.test}" is found nowhere in apps/, sidecars/, integrations/ or tests/`);
    if ((row.status === 'deferred' || row.status === 'rejected') && row.slice !== 'none') errors.push(`${row.id}: a ${row.status} row needs slice "none"`);
  }
  const agreed = rows.filter((row) => row.status === 'agreed' || row.status === 'agreed-with-conditions');
  const agreedWithoutTest = agreed.filter((row) => !row.test).length;
  if (ENFORCE_TEST_NAMES) for (const row of agreed.filter((r) => !r.test)) errors.push(`${row.id}: ${row.status} row has no test name`);
  const needPointer = rows.filter((row) => (row.status === 'deferred' || row.status === 'rejected') && !row.pointer).map((row) => row.id);
  return { errors, agreedWithoutTest, needPointer };
}

function loadSliceIds() {
  const dir = join(ROOT, 'docs/prds');
  const ids = new Set();
  for (const name of readdirSync(dir)) {
    if (/^studio-next-.*\.prd\.md$/.test(name)) for (const id of parseSliceIds(readFileSync(join(dir, name), 'utf8'))) ids.add(id);
  }
  return ids;
}

function gitGrepFinds(name) {
  try {
    execFileSync('git', ['grep', '-qF', '--', name, '--', 'apps', 'sidecars', 'integrations', 'tests'], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

function main(argv) {
  const lines = parseSource(readFileSync(join(ROOT, SOURCE), 'utf8'));
  let existing = [];
  try {
    existing = parseIndex(readFileSync(join(ROOT, INDEX), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (argv.includes('--write')) {
    const rows = buildRows(lines, existing);
    writeFileSync(join(ROOT, INDEX), renderIndex(rows));
    console.log(`wrote ${rows.length} rows to ${INDEX}`);
    return 0;
  }
  const { errors, agreedWithoutTest, needPointer } = checkIndex(lines, existing, { sliceIds: loadSliceIds(), testExists: gitGrepFinds });
  console.log(`${existing.length} rulings; ${agreedWithoutTest} agreed rows without a test name (enforced: ${ENFORCE_TEST_NAMES}); ${needPointer.length} deferred or rejected rows need a pointer`);
  for (const error of errors) console.error(error);
  return errors.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
