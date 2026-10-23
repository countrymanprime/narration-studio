#!/usr/bin/env node
/* global console, process, URL */
// Splits the Vitest files across `vitest --shard=i/N` by cost. Vitest's own split sorts the files by a hash of their path
// and cuts the list into equal counts, so it balances the number of files, not the time: with a few files costing minutes
// (App.test.tsx alone is 14% of the run) one of three shards got 48% of it. vite.config.ts hands this module's
// `assignShard` to Vitest as the sequencer's `shard`, so `--shard=i/N` keeps its meaning and every file still lands in
// exactly one shard.
//
// The costs are in vitest-shard-weights.json. Only the balance depends on them: a file missing from the list weighs
// `default`, a stale weight makes a shard longer, and neither can drop a file from the run (vitest-shards.test.mjs pins that).
// Refresh them from a profile:
//   pnpm --dir apps/ui exec vitest run --reporter=json --outputFile=profile.json
//   node apps/ui/scripts/vitest-shards.mjs --profile profile.json > apps/ui/scripts/vitest-shard-weights.json
import { readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEIGHTS_PATH = fileURLToPath(new URL('./vitest-shard-weights.json', import.meta.url));
/** How many of the costliest files get their own weight; the rest weigh the mean of the profile's remainder. */
const LISTED = 30;

export function loadWeights(path = WEIGHTS_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** The files of shard `index` (1-based) of `count`: longest first into the lightest shard, ties by path and then index. */
export function assignShard(files, index, count, weights = loadWeights()) {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 1 || index > count) {
    throw new Error(`shard ${index}/${count} is not a shard`);
  }
  const weight = (file) => weights.files[file] ?? weights.default;
  const bins = Array.from({ length: count }, () => ({ load: 0, files: new Set() }));
  for (const file of [...files].sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : a > b ? 1 : 0))) {
    const lightest = bins.reduce((best, bin) => (bin.load < best.load ? bin : best));
    lightest.load += weight(file);
    lightest.files.add(file);
  }
  // The caller's order is kept, so Vitest's own ordering of the specs still applies.
  return files.filter((file) => bins[index - 1].files.has(file));
}

/** Weights from a `vitest --reporter=json` profile: seconds per file for the costliest, the mean of the rest as default. */
export function weightsFromProfile(profile, root) {
  const base = root.split(sep).join('/').replace(/\/+$/, '');
  const rows = profile.testResults
    .map((file) => ({ path: file.name.split(sep).join('/').replace(`${base}/`, ''), seconds: (file.endTime - file.startTime) / 1000 }))
    .sort((a, b) => b.seconds - a.seconds || (a.path < b.path ? -1 : 1));
  const rest = rows.slice(LISTED);
  const mean = rest.length ? rest.reduce((sum, row) => sum + row.seconds, 0) / rest.length : 1;
  return {
    $comment: loadWeights().$comment,
    default: Math.round(mean * 10) / 10,
    files: Object.fromEntries(rows.slice(0, LISTED).map((row) => [row.path, Math.round(row.seconds)])),
  };
}

/** The path form the weights use: relative to the Vitest root, forward slashes. */
export const relativeSpec = (root, moduleId) => relative(root, moduleId).split(sep).join('/');

function main(argv) {
  const at = argv.indexOf('--profile');
  if (at < 0 || !argv[at + 1]) {
    console.error('Usage: vitest-shards.mjs --profile <vitest json report>   (prints the weights file)');
    process.exit(2);
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  process.stdout.write(`${JSON.stringify(weightsFromProfile(JSON.parse(readFileSync(argv[at + 1], 'utf8')), root), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
