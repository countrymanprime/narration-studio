// The guard that keeps the product's name from before the rename out of the repository and out of what it ships (#2251 item
// 41). It fails on the old name in any spelling ("<old>-<name>", "<Old> <Name>", "<OldName>", "<OLD>_<NAME>", ...) in a tracked
// file's path or text, in a built site, or in a release folder's file names and text. There is no exception: the name was retired
// before the first public release, with no migration (owner decision, 2026-10-23).
//
//   node scripts/ci/old-name.mjs                 checks every tracked file (old-name.test.mjs runs this in the repo-scripts check)
//   node scripts/ci/old-name.mjs dir <path>...   checks every file under each folder, or each file named: the built site
//                                                (pages.yml, site-preview.yml) and the release assets and notes (prerelease.yml,
//                                                promote-release.yml); assets.mjs verify runs checkFolder too

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readTrackedText, trackedFiles } from './layout.mjs';

// Written as patterns so this file does not match itself. In text the two words may also be split across a line break, as
// wrapped prose and comments split them, with the next line's indent or comment marker between.
const OLD_NAME = /narration[-_ .]?utils/i;
const OLD_NAME_IN_TEXT = /narration(?:[-_ .]|[ \t]*\r?\n[ \t>*#/-]*)?utils/gi;

/** The line numbers (1-based) and lines of text where the old name starts. */
export function findOldName(text) {
  const lines = text.split('\n');
  const hits = [];
  for (const match of text.matchAll(OLD_NAME_IN_TEXT)) {
    const line = text.slice(0, match.index).split('\n').length;
    hits.push({ line, text: lines[line - 1].trim().slice(0, 160) });
  }
  return hits;
}

/** Problems in the tracked files: an old name in a path or in the text. */
export function checkTracked(files = trackedFiles(), texts = readTrackedText(files)) {
  const problems = [];
  for (const file of files) {
    if (OLD_NAME.test(file)) problems.push(`${file}: the path holds the old name`);
    for (const hit of findOldName(texts.get(file) ?? '')) problems.push(`${file}:${hit.line}: ${hit.text}`);
  }
  return problems;
}

/** Problems under a built folder (a site, a release): every file's path and, for a file that is not binary, its text. */
export function checkFolder(folder) {
  const problems = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const name = relative(folder, path).split('\\').join('/');
      if (OLD_NAME.test(entry.name)) problems.push(`${name}: the name holds the old name`);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile()) {
        const bytes = readFileSync(path);
        // A zip (the update package) is checked by the names it holds, which the updater unpacks; another binary (an image, a
        // program) only by its own name.
        const inside = entry.name.toLowerCase().endsWith('.zip') ? zipEntryNames(bytes) : null;
        if (inside) {
          for (const inner of inside) if (OLD_NAME.test(inner)) problems.push(`${name}!${inner}: the name holds the old name`);
          continue;
        }
        if (bytes.includes(0)) continue;
        for (const hit of findOldName(bytes.toString('utf8'))) problems.push(`${name}:${hit.line}: ${hit.text}`);
      }
    }
  };
  walk(folder);
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
      const name = OLD_NAME.test(path) ? [`${path}: the name holds the old name`] : [];
      return name.concat(findOldName(readFileSync(path, 'utf8')).map((hit) => `${path}:${hit.line}: ${hit.text}`));
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
