import assert from 'node:assert/strict';
import test from 'node:test';

import { findSlop, isIgnored, loadConfig, proseLines } from './docs-slop.mjs';

const PHRASES = [
  { id: 'delve', level: 'error', pattern: '\\bdelv(e|es|ed|ing)\\b', reason: 'r' },
  { id: 'robust', level: 'warn', pattern: '\\brobust\\b', reason: 'r' },
];

test('findSlop reports file-relative line, id, level and the matched text', () => {
  const hits = findSlop('first line\nWe delve into the code.\n', PHRASES);

  assert.deepEqual(hits, [{ line: 2, id: 'delve', level: 'error', match: 'delve', reason: 'r' }]);
});

test('findSlop skips fenced code, inline code, link targets, quotations, comments and front matter', () => {
  const text = [
    '---',
    'title: delve',
    '---',
    '```text',
    'delve in a fence',
    '```',
    'Use `delve` as a flag, see [docs](https://example.com/delve) and <!-- delve -->.',
    '> a quotation that says delve',
    '~~~',
    'delve in a tilde fence',
    '~~~',
  ].join('\n');

  assert.deepEqual(findSlop(text, PHRASES), []);
});

test('findSlop keeps link text: the words a reader sees are checked, the URL is not', () => {
  assert.equal(findSlop('See [delve into it](https://example.com/x).', PHRASES).length, 1);
});

test('findSlop reports a warn-level phrase without an error', () => {
  const hits = findSlop('A robust parser.', PHRASES);

  assert.deepEqual(hits.map((hit) => hit.level), ['warn']);
});

test('findSlop skips a multi-line comment and reads a GitHub alert', () => {
  assert.deepEqual(findSlop('<!--\nwe delve here\n-->\nafter\n', PHRASES), []);
  assert.equal(findSlop('> [!NOTE] we delve here\n', PHRASES).length, 1);
});

test('proseLines keeps line numbers across skipped regions', () => {
  const lines = proseLines('a\n```\nb\n```\nc\n');

  assert.deepEqual(lines.filter((line) => line.text.trim() !== '').map((line) => [line.number, line.text]), [
    [1, 'a'],
    [5, 'c'],
  ]);
});

test('an unterminated fence swallows the rest of the file rather than flagging code', () => {
  assert.deepEqual(findSlop('```\ndelve\n', PHRASES), []);
});

test('isIgnored matches the ignore globs', () => {
  assert.equal(isIgnored('docs/adr/0001-x.md', ['docs/adr/**']), true);
  assert.equal(isIgnored('docs/architecture/x.md', ['docs/adr/**']), false);
});

test('the shipped phrase list: every entry is well formed and compiles, ids are unique', () => {
  const { phrases } = loadConfig();
  const ids = phrases.map((phrase) => phrase.id);

  assert.ok(phrases.length > 0);
  assert.equal(new Set(ids).size, ids.length);
  for (const phrase of phrases) {
    assert.ok(phrase.id && phrase.reason, `${phrase.id}: id and reason`);
    assert.ok(['error', 'warn'].includes(phrase.level), `${phrase.id}: level`);
    assert.doesNotThrow(() => new RegExp(phrase.pattern, 'i'), phrase.id);
  }
});

test('the shipped phrase list flags known filler as errors', () => {
  const { phrases } = loadConfig();
  const samples = [
    'This section will delve into the bridge.',
    'The cache plays a crucial role in startup.',
    "It's worth noting that the cache is cold.",
    'It is important to note the order.',
    'In conclusion, the bridge works.',
    "In today's fast-paced world, builds matter.",
    'It stands as a testament to the design.',
    'A seamless upgrade path.',
    'I hope this helps!',
  ];

  for (const sample of samples) {
    assert.ok(findSlop(sample, phrases).some((hit) => hit.level === 'error'), sample);
  }
});

test('the shipped phrase list leaves ordinary technical sentences alone at error level', () => {
  const { phrases } = loadConfig();
  const samples = [
    'The parser is robust to a missing field: a test feeds it an empty row.',
    'The updater replaces the app only after a confirmed click.',
    'Run `pnpm check` before you push.',
    'Use the tool to leverage the keychain.',
  ];

  for (const sample of samples) {
    assert.deepEqual(findSlop(sample, phrases).filter((hit) => hit.level === 'error'), [], sample);
  }
});
