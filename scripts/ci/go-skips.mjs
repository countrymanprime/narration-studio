#!/usr/bin/env node
// Lists the Go tests that skipped themselves, with the reason each gave, from `go test -json` output on stdin:
//
//   go test -json ./internal/findings/ ./internal/assetmove/ | node scripts/ci/go-skips.mjs --summary
//
// A guard that skips (a permission test whose icacls deny is not enforced for an elevated process, a link test that needs a privilege the
// runner lacks) reads green and proves nothing, so the Windows shard prints what skipped and why (#3625). The report is information: the
// script exits 0 unless `--fail-on <regex>` is given and a skipped test's name matches it (or a package did not build, so its guards could not
// run), so a guard that must run can be made to fail when it does not. `--summary` appends the table to $GITHUB_STEP_SUMMARY when it is set.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * @param {string} text  `go test -json` output, one JSON event per line (a line that is not JSON is ignored).
 * @returns {{ skips: { package: string, test: string, reason: string }[], notBuilt: string[], events: number }}
 *   the tests that skipped, in the order they finished; the packages that did not build (so none of their tests ran); how many events were read.
 */
export function parse(text) {
  const outputs = new Map(); // "package\ttest" -> the test's own output lines, in order
  const skips = [];
  const notBuilt = new Set();
  let events = 0;
  for (const line of text.split('\n')) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!event || typeof event !== 'object') continue;
    events++;
    if (event.Action === 'build-fail' && event.ImportPath) notBuilt.add(String(event.ImportPath).replace(/ \[.*\]$/, ''));
    if (!event.Test) continue;
    const key = `${event.Package}\t${event.Test}`;
    if (event.Action === 'output') {
      const lines = outputs.get(key) ?? [];
      lines.push(String(event.Output ?? ''));
      outputs.set(key, lines);
    } else if (event.Action === 'skip') {
      skips.push({ package: event.Package, test: event.Test, reason: reasonOf(outputs.get(key) ?? []) });
    }
  }
  return { skips, notBuilt: [...notBuilt], events };
}

/** @returns {{ package: string, test: string, reason: string }[]} the tests that skipped (see parse). */
export function skippedTests(text) {
  return parse(text).skips;
}

/**
 * The message the test gave `t.Skip`: the text of the last `file_test.go:12: ` line before the `--- SKIP` line, with the lines that continue it
 * (a reason that spans lines, such as a command's output) joined by a space. A log line the test wrote before it skipped is not the reason.
 */
function reasonOf(lines) {
  const stop = lines.findIndex((line) => line.trimStart().startsWith('--- SKIP'));
  const own = (stop === -1 ? lines : lines.slice(0, stop)).filter((line) => !/^\s*=== /.test(line));
  let start = -1;
  own.forEach((line, index) => {
    if (/_test\.go:\d+:/.test(line)) start = index;
  });
  if (start === -1) return '(no reason given)';
  const [first, ...rest] = own.slice(start);
  const head = /_test\.go:\d+:\s*(.*)$/.exec(first.trimEnd())?.[1] ?? '';
  const text = [head, ...rest.map((line) => line.trim())]
    .map((part) => part.trimEnd())
    .filter((part) => part !== '')
    .join(' ');
  return text === '' ? '(no reason given)' : text;
}

const cell = (text) => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');

/** @returns {string} a Markdown report: the table of skips (or that nothing skipped), and any package that did not build or input that was empty. */
export function markdown(result, title = 'Skipped Go tests') {
  const { skips, notBuilt, events } = Array.isArray(result) ? { skips: result, notBuilt: [], events: 1 } : result;
  const lines = [`### ${title}`, ''];
  if (events === 0) {
    lines.push('No `go test -json` output was read, so nothing is known about skips (did the test command run?).');
  } else if (skips.length === 0) {
    lines.push('No test skipped.');
  } else {
    lines.push(`${skips.length} skipped.`, '', '| Package | Test | Reason |', '| --- | --- | --- |');
    for (const skip of skips) lines.push(`| ${cell(skip.package.replace(/^desktop\//, ''))} | ${cell(skip.test)} | ${cell(skip.reason)} |`);
  }
  for (const pkg of notBuilt) lines.push('', `**${cell(pkg)} did not build: none of its tests ran, so none could be listed.**`);
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  let failOn = null;
  if (args.includes('--fail-on')) {
    const value = args[args.indexOf('--fail-on') + 1];
    if (value === undefined || value.startsWith('--')) {
      console.error('::error::--fail-on needs a regular expression');
      process.exit(2);
    }
    try {
      failOn = new RegExp(value);
    } catch (error) {
      console.error(`::error::--fail-on is not a regular expression: ${error.message}`);
      process.exit(2);
    }
  }
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    const result = parse(input);
    const report = markdown(result);
    console.log(report);
    if (args.includes('--summary') && process.env.GITHUB_STEP_SUMMARY) {
      try {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
      } catch (error) {
        console.error(`::warning::the report could not be added to the job summary: ${error.message}`);
      }
    }
    if (!failOn) return;
    const blocked = result.skips.filter((skip) => failOn.test(skip.test));
    if (blocked.length > 0 || result.notBuilt.length > 0 || result.events === 0) {
      const why = [
        blocked.length > 0 ? `${blocked.length} test(s) that must run skipped: ${blocked.map((skip) => skip.test).join(', ')}` : '',
        result.notBuilt.length > 0 ? `did not build: ${result.notBuilt.join(', ')}` : '',
        result.events === 0 ? 'no test output was read' : '',
      ].filter(Boolean);
      console.error(`::error::${why.join('; ')}`);
      process.exit(1);
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
