#!/usr/bin/env node
// Reports each check of a job that runs several checks as sequential steps, so one red step does not hide the others' results.
//
//   OUTCOMES='{"python": "success", "reaper (Lua)": "failure"}' node scripts/ci/step-summary.mjs
//
// OUTCOMES maps a check's name to its step's `steps.<id>.outcome` (success, failure, cancelled or skipped). Prints a Markdown table
// and appends it to $GITHUB_STEP_SUMMARY when set. Exits 1 when any check failed or was cancelled, or when OUTCOMES names no check or
// holds an empty outcome (a step id that does not exist reads as ''). The checks' own steps stay plain steps with `if: !cancelled()`,
// so the job fails on a red step whether or not this summary runs; the summary is the report, not the gate.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MARK = { success: 'passed', skipped: 'skipped (not affected or not in this tier)', failure: 'FAILED', cancelled: 'CANCELLED' };

/** @param {Record<string, string>} outcomes  @returns {{ok: boolean, markdown: string, failed: string[]}} */
export function summarize(outcomes) {
  const entries = Object.entries(outcomes ?? {});
  const failed = entries.filter(([, outcome]) => outcome !== 'success' && outcome !== 'skipped').map(([name]) => name);
  const lines = ['| Check | Result |', '| --- | --- |', ...entries.map(([name, outcome]) => `| ${name} | ${MARK[outcome] ?? `unknown outcome '${outcome}'`} |`)];
  if (entries.length === 0) return { ok: false, markdown: 'No checks were reported to the summary.', failed: ['(none reported)'] };
  return { ok: failed.length === 0, markdown: lines.join('\n'), failed };
}

function main() {
  let outcomes;
  try {
    outcomes = JSON.parse(process.env.OUTCOMES ?? '');
  } catch {
    console.error('::error::OUTCOMES is not JSON');
    process.exit(1);
  }
  const { ok, markdown, failed } = summarize(outcomes);
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  if (!ok) {
    console.log(`::error::${failed.length} check(s) did not pass: ${failed.join(', ')}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
