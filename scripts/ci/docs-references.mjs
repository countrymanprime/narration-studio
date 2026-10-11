#!/usr/bin/env node
// Finds repo paths and root `pnpm` scripts that a doc names in backticks and that no longer exist (issue #943).
//
// lychee checks Markdown links and prd-references.mjs checks PRD paths in source comments. Neither sees `apps/x/y.go`
// written as inline code in a doc, which is how a doc usually names a file, so a rename leaves it behind. This does.
//
//   node scripts/ci/docs-references.mjs [--base REF] [--all] [--strict] [--summary]
//
// Without --strict it only reports and exits 0: a backticked word that looks like a path but is not one is a false
// positive, and the first runs measure how many there are. --strict fails on any finding.
//
// Skipped on purpose: ADRs (history: they name retired paths), PRDs (plans: they name files that do not exist yet),
// research and generated docs/ui. Skipped refs: placeholders (`<x>`, `{a,b}`, `*`, `$`, `NNNN`), URLs, absolute and
// `~` paths, paths under a root the repo does not have, and paths git ignores (build output a clean checkout lacks).

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { changedMarkdownFiles } from './changed-markdown.mjs';
import { globToRegExp } from './docs-impact.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');

// Roots a documented path starts with. Anything else (a `foo/bar` that is an example, a package name) is not checked.
const ROOTS = 'apps sidecars libs integrations config tests tools scripts docs shared .github .claude'.split(' ');
const ROOT_FILES = ['README.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE', 'package.json', 'pnpm-workspace.yaml', 'nx.json', 'knip.jsonc', 'pyproject.toml'];
const UNCHECKED_FILES = ['docs/adr/**', 'docs/prds/**', 'docs/research/**', 'docs/ui/**', 'tests/fixtures/**', 'CHANGELOG.md'];
// pnpm's own commands: `pnpm licenses` is not a script in package.json.
const PNPM_BUILTINS = new Set(['add', 'audit', 'config', 'create', 'dedupe', 'dlx', 'env', 'exec', 'fetch', 'import', 'init', 'install', 'licenses', 'list', 'ls', 'outdated', 'pack', 'prune', 'publish', 'rebuild', 'remove', 'run', 'store', 'test', 'update', 'why', 'i', 'up', 'rm', 'un', 'link', 'unlink', 'patch', 'deploy', 'start', 'root', 'bin', 'cache', 'setup', 'view', 'approve-builds', 'self-update']);

const HISTORY_REACH = 50; // characters either side of a span in which such a word counts
// Words near a path that say it is gone names it on purpose ("delivered and deleted", "git log recovers it").
const HISTORY = /\b(deleted|removed|retired|gone|replaced|renamed)\b|git log/i;
const FENCE = /^\s*(```+|~~~+)/;
const INLINE_CODE = /(`+)([^`]+?)\1/g;
const PLACEHOLDER = /[<>{}*$|\\]|\.\.\./;
// A placeholder spelled in letters, as in `docs/adr/NNNN-title.md`.
const LETTER_PLACEHOLDER = /N{4}|X{4}/;
const PATH_SHAPE = /^[\w.@-]+(?:\/[\w.@-]+)*\/?$/;
const PNPM = /^pnpm (?:run )?([\w:-]+)$/;
// `internal/daw.Locate` or `internal/daw.Reach.Start`: a Go package directory followed by a symbol.
const GO_SYMBOL = /^(.*\/[a-z0-9_]+)\.[A-Z]\w*(?:\.\w+)*$/;

export function isCheckedFile(file) {
  return !UNCHECKED_FILES.some((glob) => globToRegExp(glob).test(file));
}

function pathCandidate(span) {
  const cleaned = span
    .replace(/#[\w-]*$/, '')
    .replace(/:\d+(-\d+)?$/, '')
    .replace(/\/$/, '')
    .replace(/[.,;)]+$/, '');
  if (PLACEHOLDER.test(cleaned) || LETTER_PLACEHOLDER.test(cleaned) || !PATH_SHAPE.test(cleaned)) return undefined;
  const first = cleaned.split('/')[0];
  if (ROOTS.includes(first) && cleaned.includes('/')) return cleaned;
  if (ROOT_FILES.includes(cleaned)) return cleaned;
  return undefined;
}

/** @returns {{ line: number, ref: string, kind: 'path' | 'pnpm' }[]} the checkable references in inline code. */
export function extractReferences(text) {
  const refs = [];
  let fence = null;
  const lines = text.split(/\r?\n/);
  const frontMatterEnd = lines[0]?.trim() === '---' ? lines.indexOf('---', 1) : -1;
  lines.forEach((line, index) => {
    if (index <= frontMatterEnd) return;
    const opening = FENCE.exec(line);
    if (fence) {
      if (opening && opening[1][0] === fence[0] && opening[1].length >= fence.length) fence = null;
      return;
    }
    if (opening) {
      fence = opening[1];
      return;
    }
    if (/^\s*>(?!\s*\[!)/.test(line)) return; // a quotation; a GitHub alert (`> [!NOTE]`) is still the doc's own prose
    // A path next to a word like "deleted" is named as gone on purpose. Only that span is skipped, not the whole line.
    const prose = line.replace(INLINE_CODE, (code) => ' '.repeat(code.length));
    for (const match of line.matchAll(INLINE_CODE)) {
      const span = match[2];
      const near = prose.slice(Math.max(0, match.index - HISTORY_REACH), match.index + match[0].length + HISTORY_REACH);
      if (HISTORY.test(near)) continue;
      const script = PNPM.exec(span.trim());
      if (script) {
        refs.push({ line: index + 1, ref: script[1], kind: 'pnpm' });
        continue;
      }
      const ref = pathCandidate(span.trim());
      if (ref) refs.push({ line: index + 1, ref, kind: 'path' });
    }
  });
  return refs;
}

/**
 * A path exists when it is a tracked file or the directory of one. Two looser forms also count, because docs write
 * them on purpose: a Go symbol (`internal/daw.Locate` names the package directory), and a path relative to a
 * sub-project (`tests/visual/x.ts` inside apps/ui), which resolves when any tracked path ends with it.
 */
export function makeExists(trackedFiles) {
  const known = new Set(trackedFiles);
  for (const file of trackedFiles) {
    const parts = file.split('/');
    for (let length = 1; length < parts.length; length++) known.add(parts.slice(0, length).join('/'));
  }
  const suffixes = [...known].map((path) => `/${path}`);
  return (path) => {
    if (known.has(path)) return true;
    const symbol = GO_SYMBOL.exec(path);
    if (symbol && known.has(symbol[1])) return true;
    // Only `tests/...`: a sub-project's tests folder is the documented shorthand. Any other tail would let a stale
    // `scripts/x.mjs` or `package.json` resolve to a file in some nested package.
    return path.startsWith('tests/') && suffixes.some((suffix) => suffix.endsWith(`/${path}`));
  };
}

export function findMissing(refs, { exists, scripts }) {
  return refs.filter((ref) => (ref.kind === 'pnpm' ? !scripts.has(ref.ref) && !PNPM_BUILTINS.has(ref.ref) : !exists(ref.ref)));
}

/** Of these paths, the ones git ignores: build output the docs name and a clean checkout does not have. */
export function ignoredAmong(paths) {
  if (paths.length === 0) return new Set();
  const result = spawnSync('git', ['check-ignore', '--stdin', '-z'], { cwd: REPO_ROOT, input: paths.flatMap((path) => [path, `${path}/`]).join('\0'), encoding: 'utf8' });
  // A directory that does not exist yet matches only as `path/`; report it under the name the doc used.
  return new Set((result.stdout ?? '').split('\0').filter(Boolean).map((path) => path.replace(/\/$/, '')));
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const baseFlag = args.indexOf('--base');
  const base = baseFlag !== -1 ? args[baseFlag + 1] : process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
  // Untracked files count: an agent mid-change has not committed the file its doc names.
  const tracked = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  const exists = makeExists(tracked);
  const scripts = new Set(Object.keys(JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts));
  const candidates = args.includes('--all') ? tracked.filter((file) => file.endsWith('.md')) : changedMarkdownFiles({ base, cwd: REPO_ROOT, includeWorkingTree: true });
  const files = candidates.filter(isCheckedFile);

  let report = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(join(REPO_ROOT, file), 'utf8');
    } catch {
      continue; // listed but absent from the working tree
    }
    for (const ref of findMissing(extractReferences(text), { exists, scripts })) report.push({ file, ...ref });
  }
  const ignored = ignoredAmong([...new Set(report.filter((hit) => hit.kind === 'path').map((hit) => hit.ref))]);
  report = report.filter((hit) => !ignored.has(hit.ref));

  const lines = report.map((hit) => `${hit.file}:${hit.line} ${hit.kind === 'pnpm' ? `no root pnpm script "${hit.ref}"` : `no such path ${hit.ref}`}`);
  for (const line of lines) console.log(line);
  const strict = args.includes('--strict');
  console.log(`docs-references: ${files.length} file(s), ${report.length} missing reference(s)${strict ? '' : ' (report only; --strict fails)'}.`);

  if (args.includes('--summary') && process.env.GITHUB_STEP_SUMMARY && report.length > 0) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Docs references\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
  }
  return strict && report.length > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
