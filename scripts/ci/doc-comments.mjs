#!/usr/bin/env node
// New public code needs a doc comment (issue #943; the docs-style skill holds the conventions).
//
//   node scripts/ci/doc-comments.mjs python <dir>... [--base REF]
//   node scripts/ci/doc-comments.mjs go <moduleDir> [--base REF]
//
// A ratchet by diff, not by count: only a violation on a line this change adds fails, so existing undocumented code
// (385 exported Go names and 177 Python names on 2026-10-10) is not a debt that blocks an unrelated change, and new
// code cannot add to it. Editing an old function's body does not flag it; adding a public one does.
//
// python  ruff's missing-docstring rules for public names (D100-D104, D106) with the Google convention, filtered to
//         added lines here because ruff has no "new issues only" mode. Tests, spikes and conftest are skipped.
//         `__init__` and magic methods (D105, D107) are not required. A name that needs no docstring takes `# noqa: D1xx`.
// go      revive's `exported` rule through golangci-lint and apps/desktop/.golangci-docs.yml, with its own
//         --new-from-merge-base. Test files are skipped. The stutter check is off.
//
// A brand-new Go file is seen locally only after `git add -N` (golangci-lint reads git diff); CI always sees it.
// A moved file counts only the lines that changed (git -M), so a plain `git mv` adds no debt.
//
// Not covered: TypeScript (a doc-comment coverage check needs TypeDoc or an ESLint plugin the repo does not have) and
// Lua (needs lua-language-server). The docs-style references say so.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');

export const PYTHON_RULES = ['D100', 'D101', 'D102', 'D103', 'D104', 'D106'];
const PYTHON_EXCLUDES = ['**/tests/**', '**/spikes/**', '**/conftest.py'];

/** @returns {Map<string, Set<number>>} the 1-based line numbers each file gains, from `git diff -U0` output. */
export function parseAddedLines(diffText) {
  const added = new Map();
  let file = null;
  let inHunk = false; // after the first @@ of a file, a line starting with "+++ " is content, not a header
  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      file = null;
      inHunk = false;
      continue;
    }
    if (!inHunk && line.startsWith('+++ ')) {
      // git appends a tab to a path that contains a space
      const target = line.slice(4).split('\t')[0];
      file = target === '/dev/null' ? null : target.replace(/^b\//, '');
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk) continue;
    inHunk = true;
    if (file === null) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (!added.has(file)) added.set(file, new Set());
    for (let offset = 0; offset < count; offset++) added.get(file).add(start + offset);
  }
  return added;
}

export function filterToAdded(violations, added) {
  return violations.filter((violation) => added.get(violation.file)?.has(violation.line));
}

/** Ruff's absolute filenames as repo-relative, forward-slash paths. Throws when one is not under the root, so a mismatch fails the gate instead of silently dropping every violation. */
export function parseRuffJson(json, root) {
  const base = root.replace(/\\/g, '/').replace(/\/$/, '');
  return JSON.parse(json).map((item) => {
    const full = item.filename.replace(/\\/g, '/');
    // Drive letters and short names can differ in case on Windows, so compare the prefix case-insensitively.
    if (full.slice(0, base.length + 1).toLowerCase() !== `${base}/`.toLowerCase()) {
      throw new Error(`ruff reported ${item.filename}, which is not under ${root}`);
    }
    return { file: full.slice(base.length + 1), line: item.location.row, code: item.code, message: item.message };
  });
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function resolveBase(args) {
  const flag = args.indexOf('--base');
  const base = flag !== -1 ? args[flag + 1] : process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
  try {
    return git(['merge-base', base, 'HEAD']).trim();
  } catch (error) {
    console.error(`doc-comments: cannot compare against ${base} (${error.message.split('\n')[0]}). Fetch it, or pass --base.`);
    process.exit(2);
  }
}

/** Added lines against the merge base, including files git does not track yet (every line of them is added). */
function addedLinesSince(mergeBase, paths) {
  const added = parseAddedLines(git(['-c', 'core.quotepath=false', 'diff', '-U0', '-M', mergeBase, '--', ...paths]));
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...paths]).split('\0').filter(Boolean);
  for (const file of untracked) {
    const lines = readFileSync(join(REPO_ROOT, file), 'utf8').split('\n').length;
    added.set(file, new Set(Array.from({ length: lines }, (_, index) => index + 1)));
  }
  return added;
}

function python() {
  const local = process.platform === 'win32' ? join(REPO_ROOT, '.venv', 'Scripts', 'python.exe') : join(REPO_ROOT, '.venv', 'bin', 'python');
  return existsSync(local) ? local : (process.env.PYTHON ?? 'python');
}

/** The ruff arguments. `--extend-exclude=<glob>` must use the `=` form: the two-argument form swallows the directories that follow as more globs and ruff then scans the whole working directory. */
export function ruffArgs(dirs) {
  return [
    '-m', 'ruff', 'check', '--no-cache', '--isolated', '--select', PYTHON_RULES.join(','),
    '--config', "lint.pydocstyle.convention='google'", '--output-format', 'json',
    ...PYTHON_EXCLUDES.map((pattern) => `--extend-exclude=${pattern}`),
    ...dirs,
  ];
}

function checkPython(dirs, mergeBase) {
  const result = spawnSync(python(), ruffArgs(dirs), { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // Exit 1 also means "ruff is not installed" (`python -m` exits 1), so a run counts only if it printed a JSON report.
  const ok = !result.error && (result.status === 0 || result.status === 1) && result.stdout.trim().startsWith('[');
  if (!ok) {
    console.error(`doc-comments: ruff failed or is not installed (python: ${python()}).\n${result.stderr ?? result.error ?? ''}`);
    return 2;
  }
  const violations = filterToAdded(parseRuffJson(result.stdout, REPO_ROOT), addedLinesSince(mergeBase, dirs));
  for (const violation of violations) console.log(`${violation.file}:${violation.line} ${violation.code} ${violation.message}`);
  if (violations.length > 0) {
    console.error(`doc-comments: ${violations.length} public Python name(s) added without a docstring. Add a Google-style docstring (the docs-style skill, references/python.md).`);
    return 1;
  }
  console.log(`doc-comments: no undocumented public Python names added in ${dirs.join(', ')}.`);
  return 0;
}

function checkGo(moduleDir, mergeBase) {
  const config = join(REPO_ROOT, moduleDir, '.golangci-docs.yml');
  const result = spawnSync('golangci-lint', ['run', '--config', config, '--new-from-merge-base', mergeBase, './...'], {
    cwd: join(REPO_ROOT, moduleDir),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status === 0) {
    console.log(`doc-comments: no undocumented exported Go names added in ${moduleDir}.`);
    return 0;
  }
  console.error('doc-comments: add a doc comment that starts with the name (the docs-style skill, references/go.md).');
  return result.status ?? 2;
}

function main() {
  const [kind, ...rest] = process.argv.slice(2);
  const dirs = rest.filter((arg, index) => !arg.startsWith('--') && rest[index - 1] !== '--base');
  if (!['python', 'go'].includes(kind) || dirs.length === 0) {
    console.error('usage: doc-comments.mjs python <dir>... | go <moduleDir> [--base REF]');
    return 2;
  }
  const mergeBase = resolveBase(rest);
  return kind === 'python' ? checkPython(dirs.map((dir) => relative(REPO_ROOT, join(REPO_ROOT, dir)).replace(/\\/g, '/')), mergeBase) : checkGo(dirs[0], mergeBase);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
