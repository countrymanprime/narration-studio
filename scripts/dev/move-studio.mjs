#!/usr/bin/env node
// Moves the Studio app under one folder: apps/ui -> apps/studio/ui and apps/desktop -> apps/studio/desktop (owner request, 2026-10-19).
//
//   node scripts/dev/move-studio.mjs            report only: what would move and be rewritten, and what a rewrite could not settle
//   node scripts/dev/move-studio.mjs --apply    git mv the two folders, rewrite every reference, then run the leftover scan
//
// It is meant to be re-run: the move is a pure rename (git mv plus the minimum path edits) so git's rename detection merges it with work that
// started under the old paths. Re-apply it on a fresh checkout of whatever has merged just before landing; the rewrite is idempotent.
//
// What it rewrites, in every tracked text file except docs/research/mockups/ (a frozen reference):
//   1. `apps/ui` and `apps/desktop` as a path (any separator style, `apps\ui`, `apps/ui`, `apps', 'ui`) -> the Studio folder.
//   2. A relative path (`../../docs/x`, `'..', '..', 'docs'`) inside a moved folder that leaves it, or inside apps/site, so it still reaches its target
//      from the new depth.
//   3. The few spellings those two cannot see (MANUAL below), each checked: a MANUAL edit that no longer matches is an error, not a skip.
// The Go module path (github.com/countrymanprime/narration-utils/shell) is not a directory path and does not change.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const apply = process.argv.includes('--apply');

const MOVES = { 'apps/ui': 'apps/studio/ui', 'apps/desktop': 'apps/studio/desktop' };
const SKIP_PREFIXES = ['docs/research/mockups/'];
const BINARY = /\.(png|webp|jpe?g|gif|ico|woff2?|ttf|wav|mp3|flac|zip|exe|dll|so|pdf|sum|lockb|db|bin)$/i;

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
const topLevel = new Set(tracked.map((file) => file.split('/')[0]));
topLevel.add('node_modules');
topLevel.add('dist-site');

const toNew = (path) => {
  for (const [from, to] of Object.entries(MOVES)) {
    if (path === from) return to;
    if (path.startsWith(`${from}/`)) return to + path.slice(from.length);
  }
  return path;
};
const movedApp = (path) => Object.keys(MOVES).find((from) => path === from || path.startsWith(`${from}/`));
const inSite = (path) => path.startsWith('apps/site/');
// Files whose relative paths can break: those inside a moved folder (their depth changes) and the site (its siblings move).
const relativeAware = (path) => Boolean(movedApp(path)) || inSite(path);

// Edits no pattern can derive, as [file, exact old text, new text]. Paths are the file's path BEFORE the move.
const MANUAL = [
  // The project's own reference regex in the CI test spells the separator as a character class, which the path pattern cannot see.
  ['scripts/ci/projects.test.mjs', 'apps[\\\\/]ui([\\\\/]|$)|\\.\\.[\\\\/]ui([\\\\/]|$)', 'apps[\\\\/]studio[\\\\/]ui([\\\\/]|$)|\\.\\.[\\\\/]ui([\\\\/]|$)'],
  // A path split by position: the page folder was segment 4 of apps/ui/src/components/<page>, and is segment 5 now.
  ['scripts/ci/guide-impact.test.mjs', "path.split('/')[4]", "path.split('/')[5]"],
];

const GLOBAL = /(?<![\w.-])apps([\\/]+)(ui|desktop)(?![\w-])/g;
const QUOTED_PAIR = /(['"])apps\1(\s*,\s*)(['"])(ui|desktop)\3/g;

// A relative token such as ../../docs/x.md, resolved against the file's directory before the move.
const REL = /(?<![\w.])((?:\.\.\/)+)([\w@.-][\w./@-]*)?/g;
// The same written as path.join arguments: '..', '..', 'docs'.
const JOIN = /(?<=[(,]\s*)(['"])\.\.\1(?:\s*,\s*(['"])\.\.\2)*(?:\s*,\s*(['"])([\w@./-]+)\3)?/g;

// A relative path counts only when it lands on something in the repository (a tracked file or folder, or a generated one): a made-up path in a
// test, such as '..', 'other.wav', is data and stays as written.
const known = new Set(['node_modules', 'dist-site']);
for (const file of tracked) {
  const parts = file.split('/');
  for (let i = 1; i <= parts.length; i += 1) known.add(parts.slice(0, i).join('/'));
  // An import names a module without its extension.
  known.add(file.replace(/\.[^./]+$/, ''));
}
function plausible(target) {
  return target === '.' || target === './' || known.has(target.replace(/\/$/, '')) || target.startsWith('node_modules/') || target.startsWith('dist-site/');
}

function retarget(file, rel) {
  const dir = posix.dirname(file);
  const target = posix.normalize(posix.join(dir, rel));
  if (!plausible(target)) return null;
  const inside = movedApp(file);
  const sameApp = inside && (target === inside || target.startsWith(`${inside}/`));
  if (sameApp) return null;
  const next = posix.relative(posix.dirname(toNew(file)), toNew(target));
  const withSlash = rel.endsWith('/') && !next.endsWith('/') ? `${next}/` : next;
  return withSlash === rel || withSlash === '' ? null : withSlash;
}

function rewrite(file, text, report) {
  let out = text;
  if (relativeAware(file)) {
    out = out.replace(REL, (all, ups, rest = '') => {
      const next = retarget(file, ups + rest);
      if (next === null) return all;
      report.relative += 1;
      return next;
    });
    out = out.replace(JOIN, (all, quote, _q2, _q3, last, offset, whole) => {
      // Only arguments of a path call: a list of names such as []string{".", ".."} is data.
      const before = whole.slice(whole.lastIndexOf('\n', offset) + 1, offset);
      if (!/\b(?:join|resolve|Join|Abs)\([^()]*$/.test(before)) return all;
      const count = (all.match(/['"]\.\.['"]/g) ?? []).length;
      const dir = posix.dirname(file);
      const target = posix.normalize(posix.join(dir, '../'.repeat(count), last ?? '')).replace(/^\.\/$/, '.');
      if (!plausible(target)) return all;
      const next = posix.relative(posix.dirname(toNew(file)), toNew(target));
      const unchanged = posix.relative(dir, target);
      if (next === unchanged || next === '') return all;
      report.join += 1;
      if (process.argv.includes('--verbose')) console.log(`join  ${file}: ${all}  ->  ${next}`);
      return next
        .split('/')
        .map((part) => `${quote}${part}${quote}`)
        .join(', ');
    });
  }
  out = out.replace(QUOTED_PAIR, (_all, q1, comma, q3, name) => {
    report.global += 1;
    return `${q1}apps${q1}${comma}${q3}studio${q3}${comma}${q3}${name}${q3}`;
  });
  out = out.replace(GLOBAL, (_all, separator, name) => {
    report.global += 1;
    return `apps${separator}studio${separator}${name}`;
  });
  return out;
}

const report = { files: 0, moved: 0, edited: 0, global: 0, relative: 0, join: 0, manual: 0 };
const edits = [];
for (const file of tracked) {
  if (movedApp(file)) report.moved += 1;
  if (BINARY.test(file) || SKIP_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
  let text;
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\0')) continue;
  report.files += 1;
  let next = rewrite(file, text, report);
  for (const [path, from, to] of MANUAL) {
    if (path !== file) continue;
    if (!next.includes(from)) throw new Error(`MANUAL edit for ${path} no longer matches: ${from}`);
    next = next.replace(from, to);
    report.manual += 1;
  }
  if (next !== text) {
    report.edited += 1;
    edits.push({ file, next });
  }
}

console.log(`tracked text files read: ${report.files}`);
console.log(`files that move: ${report.moved}`);
console.log(`files rewritten: ${report.edited}`);
console.log(`path rewrites: ${report.global} apps/ui|desktop, ${report.relative} relative, ${report.join} join(), ${report.manual} manual`);

if (!apply) {
  console.log('report only; pass --apply to move and rewrite');
  process.exit(0);
}

// Write the edits first (at the old paths), then move: git sees one rename with a small content change per file.
for (const { file, next } of edits) writeFileSync(join(root, file), next);
for (const [from, to] of Object.entries(MOVES)) {
  mkdirSync(join(root, dirname(to)), { recursive: true });
  execFileSync('git', ['mv', from, to], { cwd: root, stdio: 'inherit' });
}

// The leftover scan: any path that still names the old folders.
const leftover = [];
const LEFT = /(?<![\w.-])apps[\\/]+(ui|desktop)(?![\w-])/;
for (const file of git('ls-files', '-z').split('\0').filter(Boolean)) {
  if (BINARY.test(file) || SKIP_PREFIXES.some((prefix) => file.startsWith(prefix))) continue;
  let text;
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch {
    continue;
  }
  const hit = text.split('\n').findIndex((line) => LEFT.test(line));
  if (hit >= 0) leftover.push(`${file}:${hit + 1}`);
}
console.log(`leftover references to the old folders: ${leftover.length}`);
for (const place of leftover.slice(0, 50)) console.log(`  ${place}`);
