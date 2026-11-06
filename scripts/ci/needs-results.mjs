#!/usr/bin/env node
// The verdict of an aggregate check (`CI passed`, `CI light passed`) over the jobs it needs.
//
//   RESULTS="success skipped failure" node scripts/ci/needs-results.mjs [--expect <n>]
//
// RESULTS is `${{ join(needs.*.result, ' ') }}`. Passes only when every result is `success` or `skipped` (a job skipped because
// Nx found nothing affected counts as passed). Fails on `failure`, `cancelled`, any other word, an empty list, and, with --expect,
// a list of a different length (a `needs:` entry dropped without the count being changed). Used by .github/actions/ci-gate.

import { pathToFileURL } from 'node:url';

const PASSING = new Set(['success', 'skipped']);

/** @returns {{ok: boolean, message: string}} */
export function verdict(text, expect) {
  const results = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (results.length === 0) return { ok: false, message: 'no job results: the aggregate check needs at least one job' };
  if (expect !== undefined && results.length !== expect) {
    return { ok: false, message: `expected ${expect} job results, got ${results.length} (${results.join(' ')})` };
  }
  const bad = results.filter((result) => !PASSING.has(result));
  if (bad.length) return { ok: false, message: `a job this run needs ended ${[...new Set(bad)].join(', ')} (${results.join(' ')})` };
  return { ok: true, message: `needed jobs: ${results.join(' ')}` };
}

function main(argv) {
  const index = argv.indexOf('--expect');
  const expect = index >= 0 ? Number(argv[index + 1]) : undefined;
  if (expect !== undefined && !Number.isInteger(expect)) {
    console.error('--expect takes a whole number');
    process.exit(2);
  }
  const { ok, message } = verdict(process.env.RESULTS, expect);
  console.log(ok ? message : `::error::${message}`);
  process.exit(ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
