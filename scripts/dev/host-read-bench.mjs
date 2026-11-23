#!/usr/bin/env node
/* global console, process */
// Host read benchmark (#3803): seeds a book the size of a real one, with a recording check on its chapters, findings, a Story Bible,
// marks and a pickup list, and times the read bindings the pages call when they open, on the real host with no window and no DAW.
//
//   node scripts/dev/host-read-bench.mjs seed  <new-folder> [--size 1h|17h|40h|300] [--chapters N] [--paragraphs N] [--items N]
//                                                           [--tracks N] [--checked N] [--checks N] [--audio MINUTES]
//   node scripts/dev/host-read-bench.mjs reads <seeded-folder> [--runs N]
//   node scripts/dev/host-read-bench.mjs retention <seeded-folder> [--cache-entries N] [--files N]
//
// `seed` writes the book through the host's own code (TestSeedAPerfBook, src/studio/desktop/perfbook_test.go). --size picks a measured
// size: 1h is 3 chapters, 17h is 44, 40h is 103 (40 paragraphs of about 88 words each), 300 is 300 chapters of 6 paragraphs; the other
// options override it. --items is the takes on each chapter's track (100), --tracks the extra empty tracks, --checked how many chapters
// have a recording check (all) and --checks how many times each was checked (1). --audio M gives each chapter its own M-minute 48 kHz
// 24-bit recording (a sparse file) for the WorkspacePeaks read; without it every take shares one 2 s file (#4042).
// `retention` runs the ledger retention pass (#3816) twice over a copy of the book and prints what each pass cost and removed, and the first call
// of three ledger-walking reads before and after (TestPrintTheRetentionPass, retention_perf_test.go); seed with --checks 3 for superseded records.
// --files N adds N TTS previews and N Transcript Compare runs (three files each) and runs their two steps twice.
// --cache-entries N also fills the copy's analysis cache with N entries of each kind and runs the cache pass twice over them.
// `reads` prints one Markdown table a run (TestPrintTheHostReadTable, perfreads_test.go); each run is a new process, so its first calls
// meet nothing in memory. Needs Go and, on Linux, the Wails GTK libraries (.github/actions/setup-toolchain/action.yml).
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SIZES = { '1h': 'chapters=3', '17h': 'chapters=44', '40h': 'chapters=103', 300: 'chapters=300 paragraphs=6' };
const OPTIONS = ['chapters', 'paragraphs', 'items', 'tracks', 'checked', 'checks', 'audio'];
const [verb, folder, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.flatMap((arg, i) => (arg.startsWith('--') ? [[arg.slice(2), rest[i + 1]]] : [])));

function usage(message) {
  console.error(`${message}\nusage: host-read-bench.mjs seed <new-folder> [--size 1h|17h|40h|300] [--chapters N ...] | reads <seeded-folder> [--runs N] | retention <seeded-folder> [--cache-entries N] [--files N]`);
  process.exit(2);
}

function goTest(test, env) {
  const run = spawnSync('go', ['test', '-run', `^${test}$`, '-count=1', '-timeout', '6h', '-v', '.'], {
    cwd: join(import.meta.dirname, '../../src/studio/desktop'),
    env: { ...process.env, NARRATION_PERF_BOOK: resolve(folder), ...env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) {
    console.error(run.stdout, run.stderr);
    process.exit(run.status ?? 1);
  }
  return run.stdout;
}

if (!folder || !['seed', 'reads', 'retention'].includes(verb)) usage('name a verb and a folder');
if (verb === 'seed') {
  if (args.size && !SIZES[args.size]) usage(`--size is one of ${Object.keys(SIZES).join(', ')}`);
  const spec = [SIZES[args.size] ?? '', ...OPTIONS.filter((name) => args[name] !== undefined).map((name) => `${name}=${args[name]}`)].join(' ').trim();
  if (!spec.includes('chapters=')) usage('give --size or --chapters');
  mkdirSync(folder, { recursive: true });
  const started = Date.now();
  goTest('TestSeedAPerfBook', { NARRATION_PERF_SEED: spec });
  console.log(`seeded ${resolve(folder)} (${spec}) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
} else if (verb === 'retention') {
  const out = goTest('TestPrintTheRetentionPass', { NARRATION_PERF_RETENTION: '1', ...(args['cache-entries'] ? { NARRATION_PERF_CACHE_ENTRIES: args['cache-entries'] } : {}), ...(args.files ? { NARRATION_PERF_FILES: args.files } : {}) });
  const at = out.indexOf('\nRetention pass on ');
  if (at < 0) {
    console.error(out, '\nno retention table in the test output: is the folder a seeded book?');
    process.exit(1);
  }
  console.log(out.slice(at).split('\n--- ')[0].trimEnd());
} else {
  const runs = Number(args.runs ?? 1);
  if (!Number.isInteger(runs) || runs < 1) usage('--runs is a whole number of at least 1');
  for (let run = 0; run < runs; run++) {
    const out = goTest('TestPrintTheHostReadTable', { NARRATION_PERF_READS: '1' });
    // The table is everything from its heading line to the blank line after its last row.
    const at = out.indexOf('\nHost reads on ');
    if (at < 0) {
      console.error(out, '\nno read table in the test output: is the folder a seeded book?');
      process.exit(1);
    }
    console.log(out.slice(at).split('\n--- ')[0].trimEnd());
  }
}
