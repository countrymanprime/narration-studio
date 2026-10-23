// The guard that keeps the product's retired names out of the repository and out of what it ships (#2251 item 41). It fails on a
// retired name in any spelling ("<old>-<name>", "<Old> <Name>", "<OldName>", "<OLD>_<NAME>", ...) in a tracked file's path or
// text, in a built site, or in a release folder's file names and text.
//
// The retired names are in retired-names.json, each as its words, so neither file matches itself. `pnpm run rename-app` adds the
// outgoing name with `"history": true`. Such a name keeps what a rename leaves behind on purpose:
//   - the brand file and the files `brand:sync` writes, which hold the identity values (they do not follow a rename);
//   - the identity file names, the repository's own addresses and brand-name.mjs's ALLOWED history (dated research, ADRs, ...);
//   - in a built folder, every identity value: the program, the release assets and the generated modules carry them.
// A name with `"history": false` has no exception: the first name was retired before the first public release, with no
// migration (owner decision, 2026-10-23).
//
//   node scripts/ci/old-name.mjs                 checks every tracked file (old-name.test.mjs runs this in the repo-scripts check)
//   node scripts/ci/old-name.mjs dir <path>...   checks every file under each folder, or each file named: the built site
//                                                (pages.yml, site-preview.yml) and the release assets and notes (prerelease.yml,
//                                                promote-release.yml); assets.mjs verify runs checkFolder too

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BRAND_FILE, loadBrand } from '../brand/brand.mjs';
import { TARGETS } from '../brand/sync.mjs';
import { ALLOWED, identityFileNames, judgedText } from './brand-name.mjs';
import { readTrackedText, trackedFiles } from './layout.mjs';

export const RETIRED_FILE = join(dirname(fileURLToPath(import.meta.url)), 'retired-names.json');

/** The retired names: [{ words, retired, history }]. */
export function loadRetired(file = RETIRED_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

// In text the words may also be split across a line break, as wrapped prose and comments split them, with the next line's
// indent or comment marker between.
const pattern = (words, separator, flags) => new RegExp(words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(separator), flags);
const inName = (entry) => pattern(entry.words, '[-_ .]?', 'i');
const inText = (entry) => pattern(entry.words, '(?:[-_ .]|[ \\t]*\\r?\\n[ \\t>*#/-]*)?', 'gi');

/** The line numbers (1-based) and lines of text where a retired name starts. */
export function findOldName(text, retired = loadRetired()) {
  const lines = text.split('\n');
  const hits = [];
  for (const entry of retired) {
    for (const match of text.matchAll(inText(entry))) {
      const line = text.slice(0, match.index).split('\n').length;
      hits.push({ line, text: lines[line - 1].trim().slice(0, 160) });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

const nameHolds = (name, retired) => retired.some((entry) => inName(entry).test(name));
const allowed = (file) => [...ALLOWED.keys()].some((entry) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry));

/** Problems in the tracked files: a retired name in a path or in the text. */
export function checkTracked(files = trackedFiles(), texts = readTrackedText(files), retired = loadRetired(), brand = loadBrand()) {
  const strict = retired.filter((entry) => !entry.history);
  const history = retired.filter((entry) => entry.history);
  const exempt = new Set([BRAND_FILE, ...TARGETS.map((target) => target.path)]);
  const identityNames = identityFileNames(brand);
  const problems = [];
  for (const file of files) {
    const text = texts.get(file) ?? '';
    const historyApplies = history.length > 0 && !exempt.has(file) && !allowed(file);
    if (nameHolds(file, strict) || (historyApplies && !identityNames.includes(file.split('/').pop()) && nameHolds(file, history))) {
      problems.push(`${file}: the path holds the old name`);
    }
    const hits = [...findOldName(text, strict), ...(historyApplies ? findOldName(judgedText(text, brand), history) : [])];
    for (const hit of hits.sort((a, b) => a.line - b.line)) problems.push(`${file}:${hit.line}: ${hit.text}`);
  }
  return problems;
}

/** Text with the identity values blanked: a built folder ships them under a retired name on purpose. */
function withoutIdentity(text, brand) {
  return Object.values(brand.identity)
    .sort((a, b) => b.length - a.length)
    .reduce((judged, value) => judged.replaceAll(value, ''), text);
}

/** Problems under a built folder (a site, a release): every file's path and, for a file that is not binary, its text. */
export function checkFolder(folder, retired = loadRetired(), brand = loadBrand()) {
  const problems = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const name = relative(folder, path).split('\\').join('/');
      if (entry.isDirectory()) {
        if (builtNameHolds(entry.name, retired, brand)) problems.push(`${name}: the name holds the old name`);
        walk(path);
      } else if (entry.isFile()) {
        problems.push(...checkBuiltFile(path, name, retired, brand));
      }
    }
  };
  walk(folder);
  return problems;
}

const builtNameHolds = (name, retired, brand) =>
  nameHolds(name, retired.filter((entry) => !entry.history)) || nameHolds(withoutIdentity(name, brand), retired.filter((entry) => entry.history));

/** Problems in one built file, reported under name: its own name and, for a file that is not binary, its text. */
export function checkBuiltFile(path, name, retired = loadRetired(), brand = loadBrand()) {
  const problems = builtNameHolds(basename(name), retired, brand) ? [`${name}: the name holds the old name`] : [];
  const bytes = readFileSync(path);
  // A zip (the update package) is checked by the names it holds, which the updater unpacks; another binary (an image, a
  // program) only by its own name.
  const inside = name.toLowerCase().endsWith('.zip') ? zipEntryNames(bytes) : null;
  if (inside) {
    for (const inner of inside) if (builtNameHolds(inner, retired, brand)) problems.push(`${name}!${inner}: the name holds the old name`);
    return problems;
  }
  if (bytes.includes(0)) return problems;
  const text = bytes.toString('utf8');
  const hits = [
    ...findOldName(text, retired.filter((entry) => !entry.history)),
    ...findOldName(judgedText(withoutIdentity(text, brand), brand), retired.filter((entry) => entry.history)),
  ];
  for (const hit of hits.sort((a, b) => a.line - b.line)) problems.push(`${name}:${hit.line}: ${hit.text}`);
  return problems;
}

/** The file names a zip's central directory lists, or null when the bytes are not a zip. */
export function zipEntryNames(bytes) {
  const names = [];
  // The end-of-central-directory record is in the last 64 KiB + 22 bytes; it gives the directory's offset and entry count.
  for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 65557); end--) {
    if (bytes.readUInt32LE(end) !== 0x06054b50) continue;
    let at = bytes.readUInt32LE(end + 16);
    const count = bytes.readUInt16LE(end + 10);
    for (let index = 0; index < count && at + 46 <= bytes.length && bytes.readUInt32LE(at) === 0x02014b50; index++) {
      const nameLength = bytes.readUInt16LE(at + 28);
      names.push(bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8'));
      at += 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
    }
    return names;
  }
  return null;
}

function main(args) {
  let problems;
  if (args[0] === 'dir') {
    if (args.length < 2) throw new Error('usage: old-name.mjs dir <path>...');
    problems = args.slice(1).flatMap((path) => {
      if (statSync(path).isDirectory()) return checkFolder(path).map((problem) => `${path}/${problem}`);
      return checkBuiltFile(path, path);
    });
  } else {
    problems = checkTracked();
  }
  if (problems.length) {
    console.error(`The product's old name is used (see scripts/ci/old-name.mjs):\n${problems.join('\n')}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
