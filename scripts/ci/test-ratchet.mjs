#!/usr/bin/env node
// Tests only ratchet up: a change may not delete a test file, add a skip or focus marker to one, or lower a coverage floor.
//
// node scripts/ci/test-ratchet.mjs <base-ref>   Compares HEAD with the merge base and prints one line per violation.
//
// Exit 1 on a violation. The `Test ratchet` workflow lets a pull request through when the owner has put the
// `ratchet-approved` label on it, so an unattended agent cannot weaken its own gate and still merge
// (docs/operations/agent-train.md, "Safety net"). Reads the diff only, so the existing tree never fails.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const FLOORS_FILE = 'scripts/ci/coverage-floors.json';

const TEST_PATH = [/\.(test|spec)\.[cm]?[jt]sx?$/, /_test\.go$/, /(^|\/)test_[^/]+\.py$/, /_test\.py$/, /(^|\/)tests\/[^/]+\.(lua|py)$/, /_spec\.lua$/];
const WEAKENING = [
  [/\b(it|test|describe)\.(skip|fixme|only)\s*\(/, 'a skipped or focused test'],
  [/\bx(it|describe)\s*\(/, 'a skipped test'],
  [/\bt\.Skip(f|Now)?\s*\(/, 'a Go t.Skip'],
  [/@pytest\.mark\.(skip|xfail)\b/, 'a pytest skip or xfail marker'],
  [/\bpytest\.(skip|xfail)\s*\(/, 'a pytest skip or xfail call'],
];

/** Whether a repo path is a test file in one of the layouts this repo uses. */
export function isTestPath(path) {
  return TEST_PATH.some((pattern) => pattern.test(path));
}

/** The added lines of a unified diff, each with the file it belongs to. */
export function parseAddedLines(diff) {
  const added = [];
  let path;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) path = line.startsWith('+++ b/') ? line.slice(6) : undefined;
    else if (line.startsWith('+') && path) added.push({ path, text: line.slice(1) });
  }
  return added;
}

const floorKey = (entry) => `${entry.tool} ${entry.project} ${entry.path}`;

function floorViolations(before, after) {
  const now = new Map(after.map((entry) => [floorKey(entry), entry]));
  return before.flatMap((entry) => {
    const current = now.get(floorKey(entry));
    if (current === undefined) return [`coverage floor for ${entry.path} (${entry.tool}) was removed`];
    if (current.floor < entry.floor) return [`coverage floor for ${entry.path} (${entry.tool}) fell from ${entry.floor} to ${current.floor}`];
    // The floor that applies off Windows is a floor too. Dropping it makes the gate stricter on those hosts, so only lowering one counts.
    if (entry.nonWindowsFloor !== undefined && current.nonWindowsFloor !== undefined && current.nonWindowsFloor < entry.nonWindowsFloor) {
      return [`non-Windows coverage floor for ${entry.path} (${entry.tool}) fell from ${entry.nonWindowsFloor} to ${current.nonWindowsFloor}`];
    }
    return [];
  });
}

/** Every way the change weakens the tests, as one sentence each. Empty when it only adds or strengthens them. */
export function findRatchetViolations({ changes, addedLines, floorsBefore, floorsAfter }) {
  const violations = [];
  for (const change of changes) {
    if (change.status === 'D' && isTestPath(change.path)) violations.push(`deleted test file ${change.path}`);
    if (change.status === 'R' && isTestPath(change.from) && !isTestPath(change.path)) {
      violations.push(`${change.from} is no longer a test file after moving to ${change.path}`);
    }
  }
  for (const { path, text } of addedLines) {
    if (!isTestPath(path)) continue;
    const hit = WEAKENING.find(([pattern]) => pattern.test(text));
    if (hit) violations.push(`added ${hit[1]} in ${path}: ${text.trim()}`);
  }
  return [...violations, ...floorViolations(floorsBefore, floorsAfter)];
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function parseChanges(nameStatus) {
  return nameStatus.split('\n').filter(Boolean).map((line) => {
    const [status, first, second] = line.split('\t');
    return status.startsWith('R') ? { status: 'R', from: first, path: second } : { status: status[0], path: first };
  });
}

function floorsAt(ref) {
  try {
    return JSON.parse(git(['show', `${ref}:${FLOORS_FILE}`])).entries ?? [];
  } catch {
    return [];
  }
}

function main(baseRef) {
  const base = git(['merge-base', baseRef, 'HEAD']).trim();
  const changes = parseChanges(git(['diff', '--name-status', '-M', base, 'HEAD']));
  const addedLines = parseAddedLines(git(['diff', '-U0', '--no-color', '-M', base, 'HEAD']));
  const floorsAfter = JSON.parse(readFileSync(FLOORS_FILE, 'utf8')).entries ?? [];
  const violations = findRatchetViolations({ changes, addedLines, floorsBefore: floorsAt(base), floorsAfter });
  for (const violation of violations) console.log(`ratchet: ${violation}`);
  if (violations.length) {
    console.log(`\n${violations.length} way(s) this change weakens the tests. The owner clears it with the ratchet-approved label.`);
    process.exit(1);
  }
  console.log('test ratchet: nothing weakened');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error('usage: test-ratchet.mjs <base-ref>');
    process.exit(2);
  }
  main(baseRef);
}
