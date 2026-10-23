#!/usr/bin/env node
// Moves the app under src/ (owner decision, 2026-10-23): the Studio app and its integration points under src/studio, the Pages app to src/web.
//
//   node scripts/dev/move-studio.mjs --move                git mv every folder below to its new place, nothing else (a pure-rename commit)
//   node scripts/dev/move-studio.mjs --rewrite             report only: what the rewrite of references would change
//   node scripts/dev/move-studio.mjs --rewrite --apply     rewrite every reference to the old folders, then run the leftover scan
//
// Run the two in order and commit each on its own, so git sees commit 1 as renames at 100% similarity and commit 2 as the path edits.
// Both are idempotent. On a branch that started before the move: merge main, then run `--move` (it moves the files that main's move
// did not see, one by one into the existing folders) and `--rewrite --apply`, and commit each.
//
// What `--rewrite` changes, in every tracked text file except docs/research/mockups/ (a frozen reference) and pnpm-lock.yaml (pnpm regenerates it):
//   1. An old folder written as a path from the repository root, in any separator style (`apps/ui`, `apps\ui`, `sidecars/x`, `libs/python`).
//   2. The same written as path segments: `'apps', 'ui'` in a join call, `/ "sidecars"` in a Python path, `"libs", "python"`.
//   3. Inside a moved folder or src/web: a relative path (`../../docs/x`, `'..', '..', 'docs'`, `Path(__file__).parents[3]`) that leaves its
//      moved folder, so it still reaches its target from the new depth.
// The Go module path (github.com/countrymanprime/narration-studio/shell) is not a directory path and does not change.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = new Set(process.argv.slice(2));

// Old folder -> new folder. Each moves as a whole, so a relative path between two files of one folder stays valid.
const MOVES = {
  'apps/ui': 'src/studio/ui',
  'apps/desktop': 'src/studio/desktop',
  'apps/site': 'src/web',
  sidecars: 'src/studio/sidecars',
  integrations: 'src/studio/integrations',
  'libs/python': 'src/studio/libs/python',
  // Every consumer of the real-Audacity tests is Studio (the Go adapter, its workflows); tests/fixtures is shared and stays.
  'tests/audacity3': 'src/studio/tests/audacity3',
};
// layout.json holds the old-to-new map itself.
const SKIP = [/^docs\/research\/mockups\//, /^pnpm-lock\.yaml$/, /^scripts\/dev\/move-studio\.mjs$/, /^scripts\/ci\/layout\.json$/];
const BINARY = /\.(png|webp|jpe?g|gif|ico|woff2?|ttf|wav|mp3|flac|zip|exe|dll|so|pdf|sum|lockb|db|bin|rpp-bak)$/i;

const git = (...argv) => execFileSync('git', argv, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
const trackedFiles = () => git('ls-files', '-z').split('\0').filter(Boolean);

const under = (path, folder) => path === folder || path.startsWith(`${folder}/`);
const swap = (path, map) => {
  for (const [from, to] of map) if (under(path, from)) return to + path.slice(from.length);
  return path;
};
const FORWARD = Object.entries(MOVES);
const BACKWARD = FORWARD.map(([from, to]) => [to, from]);
const toNew = (path) => swap(path, FORWARD);
const toOld = (path) => swap(path, BACKWARD);
const movedRoot = (oldPath) => Object.keys(MOVES).find((from) => under(oldPath, from));

function move() {
  const files = trackedFiles();
  let moved = 0;
  for (const [from, to] of FORWARD) {
    const mine = files.filter((file) => under(file, from));
    if (mine.length === 0) continue;
    mkdirSync(join(root, dirname(to)), { recursive: true });
    if (!existsSync(join(root, to))) {
      // The whole folder in one rename: untracked and ignored files (node_modules, build output) move with it.
      execFileSync('git', ['mv', from, to], { cwd: root, stdio: 'inherit' });
    } else {
      // The folder already moved (a branch that merged main after the move): move what main's move did not see, file by file.
      for (const file of mine) {
        mkdirSync(join(root, dirname(toNew(file))), { recursive: true });
        execFileSync('git', ['mv', file, toNew(file)], { cwd: root, stdio: 'inherit' });
      }
    }
    moved += mine.length;
    removeEmpty(dirname(from));
  }
  console.log(`files moved: ${moved}`);
}

function removeEmpty(folder) {
  for (let dir = folder; dir && dir !== '.'; dir = dirname(dir)) {
    const full = join(root, dir);
    if (!existsSync(full) || readdirSync(full).length > 0) return;
    rmdirSync(full);
  }
}

function rewriteAll(apply) {
  const files = trackedFiles();
  const stale = files.filter((file) => movedRoot(file));
  if (stale.length > 0) throw new Error(`${stale.length} files are still under an old folder (${stale[0]}): run --move first`);

  // A relative path counts only when it lands on something in the repository as it was before the move (a tracked file or folder, or a
  // generated one): a made-up path in a test, such as '..', 'other.wav', is data and stays as written.
  const known = new Set(['.', 'node_modules', 'dist-site']);
  for (const file of files.map(toOld)) {
    const parts = file.split('/');
    for (let i = 1; i <= parts.length; i += 1) known.add(parts.slice(0, i).join('/'));
    // An import names a module without its extension.
    known.add(file.replace(/\.[^./]+$/, ''));
  }
  // apps/ and libs/ held only folders that moved; a path to them alone is data (a test's "../" + name), not a place.
  known.delete('apps');
  known.delete('libs');
  const plausible = (target) => known.has(target.replace(/\/$/, '')) || /^(node_modules|dist-site)\//.test(target);
  // The same against the tree as it is now, so a path the rewrite already settled (a re-run after merging main) stays as written.
  const current = new Set(['.', 'node_modules', 'dist-site']);
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i <= parts.length; i += 1) current.add(parts.slice(0, i).join('/'));
    current.add(file.replace(/\.[^./]+$/, ''));
  }
  const settled = (target) => current.has(target.replace(/\/$/, '')) || /^(node_modules|dist-site)\//.test(target);

  const report = { read: 0, edited: 0, root: 0, relative: 0, parents: 0 };
  const edits = [];
  for (const file of files) {
    if (BINARY.test(file) || SKIP.some((skip) => skip.test(file))) continue;
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\0')) continue;
    report.read += 1;
    const next = rewrite(file, text, plausible, settled, report);
    if (next !== text) {
      report.edited += 1;
      edits.push({ file, next });
      if (args.has('--verbose')) console.log(`edit  ${file}`);
    }
  }
  console.log(`tracked text files read: ${report.read}`);
  console.log(`files rewritten: ${report.edited}`);
  console.log(`rewrites: ${report.root} root paths, ${report.relative} relative paths, ${report.parents} Path(__file__) parents`);
  if (!apply) {
    console.log('report only; pass --apply to write');
    return;
  }
  for (const { file, next } of edits) writeFileSync(join(root, file), next);
  leftovers(files);
}

// The relative rewrites run first and fence what they produced in \u0000…\u0001, so the root-path rewrites cannot touch a path that is
// already right (`../sidecars/x` inside src/studio is not a path from the root).
const OPEN = '\u0000';
const CLOSE = '\u0001';
const fence = (text) => `${OPEN}${text}${CLOSE}`;

// A relative token such as ../../docs/x.md.
const REL = /(?<![\w.])((?:\.\.\/)+)([\w@.-][\w./@-]*)?/g;
// The same written as path.join arguments: '..', '..', 'docs'.
const JOIN = /(?<=[(,]\s*)(['"])\.\.\1(?:\s*,\s*(['"])\.\.\2)*(?:\s*,\s*(['"])([\w@./-]+)\3)?/g;
// Path(__file__).parents[3], Path(__file__).resolve().parent.parent
const PARENTS = /(Path\(__file__\)(?:\.resolve\(\))?)(?:\.parents\[(\d+)\]|((?:\.parent)+))/g;

function rewrite(file, text, plausible, settled, report) {
  const oldFile = toOld(file);
  const inside = movedRoot(oldFile);
  let out = text;
  if (inside) {
    const relocate = (target) => {
      // A target inside the same moved folder moved with it: the path is unchanged, but fenced so step 1 leaves it alone.
      if (under(target, inside)) return null;
      return posix.relative(posix.dirname(file), toNew(target)) || '.';
    };
    out = out.replace(REL, (all, ups, rest = '') => {
      const target = posix.normalize(posix.join(posix.dirname(oldFile), ups + rest));
      if (!plausible(target)) return settled(posix.normalize(posix.join(posix.dirname(file), ups + rest))) ? fence(all) : all;
      const next = relocate(target);
      if (next === null) return fence(all);
      report.relative += 1;
      return fence((rest === '' || rest.endsWith('/')) && !next.endsWith('/') ? `${next}/` : next);
    });
    out = out.replace(JOIN, (all, quote, _q2, _q3, last, offset, whole) => {
      // Only arguments of a path call (filepath.Join(filepath.Dir(file), "..")): a list of names such as []string{".", ".."} is data.
      const before = whole.slice(whole.lastIndexOf('\n', offset) + 1, offset);
      if (!/\b(?:join|resolve|Join|Abs)\(/.test(before)) return all;
      const count = (all.match(/['"]\.\.['"]/g) ?? []).length;
      const target = posix.normalize(posix.join(posix.dirname(oldFile), '../'.repeat(count), last ?? ''));
      if (!plausible(target)) {
        return settled(posix.normalize(posix.join(posix.dirname(file), '../'.repeat(count), last ?? ''))) ? fence(all) : all;
      }
      const next = relocate(target);
      if (next === null) return fence(all);
      report.relative += 1;
      return fence(
        next
          .split('/')
          .map((part) => `${quote}${part}${quote}`)
          .join(', '),
      );
    });
    out = out.replace(PARENTS, (all, head, index, chain) => {
      const ups = index === undefined ? chain.length / '.parent'.length : Number(index) + 1;
      let target = oldFile;
      for (let i = 0; i < ups; i += 1) {
        // More steps than the old path has: it already counts from the new place.
        if (target === '.') return all;
        target = posix.dirname(target);
      }
      if (under(target, inside)) return all;
      const goal = toNew(target);
      let depth = 0;
      for (let at = file; at !== goal; depth += 1) {
        if (at === '.') return all;
        at = posix.dirname(at);
      }
      report.parents += 1;
      return index === undefined ? `${head}${'.parent'.repeat(depth)}` : `${head}.parents[${depth - 1}]`;
    });
  }
  // Step 1 and 2, outside the fenced spans.
  out = out
    .split(new RegExp(`(${OPEN}[^${CLOSE}]*${CLOSE})`))
    .map((part) => (part.startsWith(OPEN) ? part.slice(1, -1) : rootPaths(part, file.endsWith('.lua'), report)))
    .join('');
  return out;
}

// A path from the repository root, written with separators.
const SLASHED = [
  [/(?<![\w.-])apps([\\/]+)(ui|desktop)(?![\w-])/g, (_all, sep, name) => ['src', 'studio', name].join(sep)],
  [/(?<![\w.-])apps([\\/]+)site(?![\w-])/g, (_all, sep) => ['src', 'web'].join(sep)],
  // A name alone at the start of an indented line is a folder tree in a doc, not a path from the root.
  [/(?<![\w.-])(?<!studio[\\/]+)(?<!(?:^|\n)[ \t]+)libs([\\/]+)python(?![\w-])/g, (_all, sep) => ['src', 'studio', 'libs', 'python'].join(sep)],
  [/(?<![\w.-])(?<!studio[\\/]+)(?<!(?:^|\n)[ \t]+)tests([\\/]+)audacity3(?![\w-])/g, (_all, sep) => ['src', 'studio', 'tests', 'audacity3'].join(sep)],
  [/(?<![\w.-])(?<!studio[\\/]+)(?<!(?:^|\n)[ \t]+)(sidecars|integrations)(?=(\\\/|\\{1,2}|\/))/g, (_all, name, sep) => ['src', 'studio', name].join(sep)],
];
// The same as quoted segments, separated by a comma (a join call) or a slash (a Python path).
const SEGMENTED = [
  [/(['"])apps\1(\s*[,/]\s*)\1(ui|desktop)\1/g, (_all, q, sep, name) => [`${q}src${q}`, `${q}studio${q}`, `${q}${name}${q}`].join(sep)],
  [/(['"])apps\1(\s*[,/]\s*)\1site\1/g, (_all, q, sep) => [`${q}src${q}`, `${q}web${q}`].join(sep)],
  [/(?<!['"]studio['"]\s*[,/]\s*)(['"])libs\1(\s*[,/]\s*)\1python\1/g, (_all, q, sep) => [`${q}src${q}`, `${q}studio${q}`, `${q}libs${q}`, `${q}python${q}`].join(sep)],
  [/(?<!['"]studio['"]\s*[,/]\s*)(['"])tests\1(\s*[,/]\s*)\1audacity3\1/g, (_all, q, sep) => [`${q}src${q}`, `${q}studio${q}`, `${q}tests${q}`, `${q}audacity3${q}`].join(sep)],
  // A single segment only where it is plainly a path step: after `/` in a Python path, or as a later argument of a join call.
  [
    /(?<=(?:\/\s*|\b(?:join|Join|resolve|joinpath)\([^()\n]*,\s*))(?<!['"]studio['"]\s*[,/]\s*)(['"])(sidecars|integrations)\1/g,
    (_all, q, name, offset, whole) => {
      const sep = /\/\s*$/.test(whole.slice(Math.max(0, offset - 3), offset)) ? ' / ' : ', ';
      return [`${q}src${q}`, `${q}studio${q}`, `${q}${name}${q}`].join(sep);
    },
  ],
];

function rootPaths(text, lua, report) {
  let out = text;
  // Lua's join takes two arguments, so a segment there is nested by hand (the leftover scan lists it).
  const segmented = lua ? SEGMENTED.slice(0, -1) : SEGMENTED;
  for (const [pattern, replace] of [...segmented, ...SLASHED]) {
    out = out.replace(pattern, (...match) => {
      report.root += 1;
      return replace(...match);
    });
  }
  return out;
}

// The leftover scan: anything that still names an old folder, for a person to settle.
function leftovers(files) {
  const LEFT = /(?<![\w.-])(?<!studio[\\/]+)(?:apps[\\/]+(?:ui|desktop|site)|libs[\\/]+python|tests[\\/]+audacity3|(?:sidecars|integrations)[\\/])|(['"])apps\1|(?<!studio['"]\)?\s*[,/]\s*)(['"])(?:sidecars|integrations|libs)\2/;
  const hits = [];
  for (const file of files) {
    if (BINARY.test(file) || SKIP.some((skip) => skip.test(file))) continue;
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    text.split('\n').forEach((line, index) => {
      if (LEFT.test(line)) hits.push(`${file}:${index + 1}: ${line.trim().slice(0, 160)}`);
    });
  }
  console.log(`leftover references to the old folders: ${hits.length}`);
  for (const hit of hits) console.log(`  ${hit}`);
}

if (args.has('--move')) move();
else if (args.has('--rewrite')) rewriteAll(args.has('--apply'));
else {
  console.log('pass --move, --rewrite or --rewrite --apply (see the header of this script)');
  process.exit(2);
}
