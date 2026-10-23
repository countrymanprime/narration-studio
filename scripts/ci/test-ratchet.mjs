#!/usr/bin/env node
// Tests only ratchet up: a change may not delete a test file, add a skip or focus marker to one, or lower a coverage floor.
//
// node scripts/ci/test-ratchet.mjs <base-ref>   Compares HEAD with the merge base and prints one line per violation.
//
// Exit 1 on a violation; the `Test ratchet` workflow reports it as a warning and does not fail the pull request, so nobody
// has to approve a deliberate change. A reviewer reads the printed violations (.claude/skills/agent-train/SKILL.md,
// "Safety net"). Reads the diff only, so the existing tree never fails.

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

/** The removed lines of a unified diff, each filed under the file's path after the change, so a renamed file keeps one key. */
export function parseRemovedLines(diff) {
  const removed = [];
  let path;
  let inHunk = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) inHunk = false;
    else if (line.startsWith('@@')) inHunk = true;
    else if (!inHunk && line.startsWith('+++ ')) path = line.startsWith('+++ b/') ? line.slice(6) : undefined;
    else if (inHunk && line.startsWith('-') && path) removed.push({ path, text: line.slice(1) });
  }
  return removed;
}

const floorKey = (entry) => `${entry.tool} ${entry.project} ${entry.path}`;

// The folder moves a change's renames add up to: for `a/x/f.go` -> `b/c/x/f.go`, `a` -> `b/c`, the parts before the path they share.
// One folder can map to several places (git pairs a few renames inexactly), so each from-folder keeps every destination.
function folderMoves(changes) {
  const moves = new Map();
  for (const change of changes) {
    if (change.status !== 'R') continue;
    const from = change.from.split('/');
    const to = change.path.split('/');
    while (from.length > 1 && to.length > 1 && from.at(-1) === to.at(-1)) {
      from.pop();
      to.pop();
    }
    if (from.length === change.from.split('/').length) continue;
    const key = from.join('/');
    if (!moves.has(key)) moves.set(key, new Set());
    moves.get(key).add(to.join('/'));
  }
  return moves;
}

// Every place a path may have moved to, the path itself first.
function movedPaths(path, moves) {
  const paths = [path];
  for (const [from, destinations] of moves) {
    if (path !== from && !path.startsWith(`${from}/`)) continue;
    for (const to of destinations) paths.push(to + path.slice(from.length));
  }
  return paths;
}

// A floor still holds after its folder moved: an entry at a moved project or path counts as the same floor. Only a moved key that
// exists is used, so a single file renamed out of a folder cannot carry that folder's floor to an entry that measures something else.
function currentFloor(entry, now, moves) {
  for (const project of movedPaths(entry.project, moves)) {
    for (const path of movedPaths(entry.path, moves)) {
      const current = now.get(floorKey({ ...entry, project, path }));
      if (current !== undefined) return current;
    }
  }
  return undefined;
}

function floorViolations(before, after, changes) {
  const now = new Map(after.map((entry) => [floorKey(entry), entry]));
  const moves = folderMoves(changes);
  return before.flatMap((entry) => {
    const current = currentFloor(entry, now, moves);
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
export function findRatchetViolations({ changes, addedLines, removedLines = [], floorsBefore, floorsAfter }) {
  const violations = [];
  for (const change of changes) {
    if (change.status === 'D' && isTestPath(change.path)) violations.push(`deleted test file ${change.path}`);
    if (change.status === 'R' && isTestPath(change.from) && !isTestPath(change.path)) {
      violations.push(`${change.from} is no longer a test file after moving to ${change.path}`);
    }
  }
  // A marker that was on a line the change removed from the same file is not new: the line was edited (a path in it rewritten) or moved.
  const removedMarkers = new Map();
  for (const { path, text } of removedLines) {
    const hit = WEAKENING.find(([pattern]) => pattern.test(text));
    if (hit) removedMarkers.set(`${path} ${hit[1]}`, (removedMarkers.get(`${path} ${hit[1]}`) ?? 0) + 1);
  }
  for (const { path, text } of addedLines) {
    if (!isTestPath(path)) continue;
    const hit = WEAKENING.find(([pattern]) => pattern.test(text));
    if (!hit) continue;
    const key = `${path} ${hit[1]}`;
    const left = removedMarkers.get(key) ?? 0;
    if (left > 0) removedMarkers.set(key, left - 1);
    else violations.push(`added ${hit[1]} in ${path}: ${text.trim()}`);
  }
  return [...violations, ...floorViolations(floorsBefore, floorsAfter, changes)];
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
  const diff = git(['diff', '-U0', '--no-color', '-M', base, 'HEAD']);
  const addedLines = parseAddedLines(diff);
  const removedLines = parseRemovedLines(diff);
  const floorsAfter = JSON.parse(readFileSync(FLOORS_FILE, 'utf8')).entries ?? [];
  const violations = findRatchetViolations({ changes, addedLines, removedLines, floorsBefore: floorsAt(base), floorsAfter });
  for (const violation of violations) console.log(`ratchet: ${violation}`);
  if (violations.length) {
    console.log(`\n${violations.length} way(s) this change weakens the tests. Say in the pull request why each one is intended.`);
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
