import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';

import { INDEX, SOURCE, STATUSES, buildRows, checkIndex, parseIndex, parseSliceIds, parseSource, renderIndex } from './studio-next-rulings.mjs';

const SRC = `# T

## Booth rulings (x)

### Agreed (build later)

- one
- two | pipe

### Deferred

- later one

## Companion ruling

- parked
`;
const ctx = { sliceIds: new Set(['SNB-1']), testExists: (name) => name === 'real test' };
const rowsFor = (src, existing = []) => buildRows(parseSource(src), existing);

test('every-bullet-has-a-row: ids are stable and a missing row fails with the bullet text', () => {
  const rows = rowsFor(SRC);
  assert.deepEqual(rows.map((r) => r.id), ['BO-1', 'BO-2', 'BO-3', 'CO-1']);
  const { errors } = checkIndex(parseSource(SRC), rows.slice(1), ctx);
  assert.ok(errors.some((e) => e.includes('no index row') && e.includes('one')), errors.join('\n'));
});

test('an inserted bullet takes the next free number and keeps the others', () => {
  const rows = rowsFor(SRC);
  const edited = SRC.replace('- one\n', '- zero\n- one\n');
  const next = rowsFor(edited, rows);
  assert.equal(next.find((r) => r.text === 'one').id, 'BO-1');
  assert.equal(next.find((r) => r.text === 'zero').id, 'BO-4');
});

test('status-comes-from-the-heading', () => {
  const rows = rowsFor(SRC);
  assert.deepEqual(rows.map((r) => r.status), ['agreed', 'agreed', 'deferred', 'deferred']);
  const all = ['Agreed', 'Agreed with conditions', 'Rejected', 'Maybe list (x)', 'Deferred', 'Need to see a mock first', 'Unclear to owner', 'Not clear to owner'];
  const got = all.map((h) => parseSource(`## Booth rulings\n\n### ${h}\n\n- a\n`)[0].status);
  assert.deepEqual(got, ['agreed', 'agreed-with-conditions', 'rejected', 'maybe', 'deferred', 'need-mock', 'unclear', 'unclear']);
});

test('an unknown heading fails loudly', () => {
  assert.throws(() => parseSource('## Booth rulings\n\n### Whatever\n\n- a\n'), /unknown status heading/);
  assert.throws(() => parseSource('## Mystery\n\n- a\n'), /unknown section heading/);
});

test('text-matches-the-source: a reworded bullet fails until --write, which keeps hand cells', () => {
  const rows = rowsFor(SRC);
  rows[0].slice = 'SNB-1';
  const edited = SRC.replace('- one\n', '- one, reworded\n');
  const { errors } = checkIndex(parseSource(edited), rows, ctx);
  assert.ok(errors.some((e) => e.includes('differs from the source')));
  const rewritten = rowsFor(edited, rows);
  assert.equal(rewritten[0].id, 'BO-1');
  assert.equal(rewritten[0].slice, 'SNB-1');
  assert.deepEqual(checkIndex(parseSource(edited), rewritten, ctx).errors, []);
});

test('owning-slice-exists and named-test-exists', () => {
  const rows = rowsFor(SRC);
  rows[0].slice = 'SNX-9';
  rows[1].test = 'nowhere';
  const { errors } = checkIndex(parseSource(SRC), rows, ctx);
  assert.ok(errors.some((e) => e.includes('SNX-9')));
  assert.ok(errors.some((e) => e.includes('"nowhere"')));
  rows[0].slice = 'SNB-1';
  rows[1].test = 'real test';
  assert.deepEqual(checkIndex(parseSource(SRC), rows, ctx).errors, []);
});

test('test names are not required yet; the count is a number', () => {
  const result = checkIndex(parseSource(SRC), rowsFor(SRC), ctx);
  assert.deepEqual(result.errors, []);
  assert.equal(typeof result.agreedWithoutTest, 'number');
  assert.equal(result.agreedWithoutTest, 2);
});

test('deferred and rejected rows need slice none; a missing pointer is listed', () => {
  const rows = rowsFor(SRC);
  assert.equal(rows[2].slice, 'none');
  assert.deepEqual(checkIndex(parseSource(SRC), rows, ctx).needPointer, ['BO-3', 'CO-1']);
  rows[2].slice = 'SNB-1';
  assert.ok(checkIndex(parseSource(SRC), rows, ctx).errors.some((e) => e.includes('needs slice "none"')));
});

test('the table round-trips, including a pipe and a pointer', () => {
  const rows = rowsFor(SRC);
  rows[3].pointer = 'SNC-Q3';
  const text = renderIndex(rows);
  assert.deepEqual(parseIndex(text), rows.map((r) => ({ ...r })));
  assert.equal(renderIndex(buildRows(parseSource(SRC), parseIndex(text))), text);
});

test('parseSliceIds reads only the Slices table', () => {
  const md = '### Slices\n\n| Slice | Scope |\n| --- | --- |\n| SNC-1 | a |\n| SNC-2 | b |\n\n## Other\n\n| SNC-9 | c |\n';
  assert.deepEqual(parseSliceIds(md), ['SNC-1', 'SNC-2']);
});

test('the real index is complete and current, and --write is idempotent', () => {
  const run = (...args) => execFileSync('node', ['scripts/ci/studio-next-rulings.mjs', ...args], { encoding: 'utf8' });
  const before = readFileSync(INDEX, 'utf8');
  try {
    run('--write');
    assert.equal(readFileSync(INDEX, 'utf8'), before, 'index was not up to date');
    run('--write');
    assert.equal(readFileSync(INDEX, 'utf8'), before);
    assert.match(run(), /\d+ agreed rows without a test name/);
  } finally {
    writeFileSync(INDEX, before);
  }
  const rows = parseIndex(before);
  assert.ok(rows.length > 100, `${rows.length} rows`);
  assert.ok(rows.every((r) => STATUSES.includes(r.status)));
  assert.ok(readFileSync(SOURCE, 'utf8').length > 0);
});
