#!/usr/bin/env node
// Lists the Go tests that skipped themselves, with the reason each gave, from `go test -json` output on stdin:
//
//   go test -json ./internal/findings/ ./internal/assetmove/ | node scripts/ci/go-skips.mjs --summary
//
// A guard that skips (a permission test whose icacls deny is not enforced for an elevated process, a link test that needs a privilege the
// runner lacks) reads green and proves nothing, so the Windows shard prints what skipped and why (#3625). The report is information: the
// script exits 0 unless `--fail-on <regex>` is given and a skipped test's name matches it, so a guard that must run can be made to fail
// when it does not. `--summary` appends the table to $GITHUB_STEP_SUMMARY when it is set.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * @param {string} text  `go test -json` output, one JSON event per line (a line that is not JSON is ignored).
 * @returns {{ package: string, test: string, reason: string }[]} the tests that skipped, in the order they finished.
 */
export function skippedTests(text) {
  const outputs = new Map(); // "package\ttest" -> the test's own output lines, in order
  const skipped = [];
  for (const line of text.split('\n')) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!event || !event.Test) continue;
    const key = `${event.Package}\t${event.Test}`;
    if (event.Action === 'output') {
      const lines = outputs.get(key) ?? [];
      lines.push(String(event.Output ?? ''));
      outputs.set(key, lines);
    } else if (event.Action === 'skip') {
      skipped.push({ package: event.Package, test: event.Test, reason: reasonOf(outputs.get(key) ?? []) });
    }
  }
  return skipped;
}

/** The text after `file_test.go:12: ` on the line that skipped: the message the test gave `t.Skip`. */
function reasonOf(lines) {
  for (const line of lines) {
    const match = /_test\.go:\d+:\s*(.*)$/.exec(line.trimEnd());
    if (match) return match[1];
  }
  return '(no reason given)';
}

/** @returns {string} a Markdown table of the skips, or a sentence when nothing skipped. */
export function markdown(skips, title = 'Skipped Go tests') {
  if (skips.length === 0) return `### ${title}\n\nNo test skipped.`;
  const rows = skips.map((skip) => `| ${skip.package.replace(/^desktop\//, '')} | ${skip.test} | ${skip.reason.replaceAll('|', '\\|')} |`);
  return [`### ${title}`, '', `${skips.length} skipped.`, '', '| Package | Test | Reason |', '| --- | --- | --- |', ...rows].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const failOn = args.includes('--fail-on') ? new RegExp(args[args.indexOf('--fail-on') + 1] ?? '(?!)') : null;
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    const skips = skippedTests(input);
    const report = markdown(skips);
    console.log(report);
    if (args.includes('--summary') && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
    const blocked = failOn ? skips.filter((skip) => failOn.test(skip.test)) : [];
    if (blocked.length > 0) {
      console.error(`::error::${blocked.length} test(s) that must run skipped: ${blocked.map((skip) => skip.test).join(', ')}`);
      process.exit(1);
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
