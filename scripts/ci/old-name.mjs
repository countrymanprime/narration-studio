// The guard that keeps the product's name from before the rename out of the repository and out of what it ships (#2251 item
// 41). It fails on the old name in any spelling ("<old>-<name>", "<Old> <Name>", "<OldName>", "<OLD>_<NAME>", ...) in a tracked
// file's path or text, in a built site, or in a release folder's file names and text, except in the files listed in ALLOWED.
//
//   node scripts/ci/old-name.mjs                 checks every tracked file (old-name.test.mjs runs this in the repo-scripts check)
//   node scripts/ci/old-name.mjs dir <path>...   checks every file under each folder, or each file named: the built site
//                                                (pages.yml, site-preview.yml) and the release assets and notes (prerelease.yml,
//                                                promote-release.yml); assets.mjs verify runs checkFolder too

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readTrackedText, trackedFiles } from './layout.mjs';

// Written as a pattern so this file does not match itself.
export const OLD_NAME = /narration[-_ .]?utils/i;

// The only tracked files that may hold the old name, each with why. The migration files move what a narrator's machine and
// projects hold under the old names (docs/reference/data-files.md#the-move-from-the-old-name).
export const ALLOWED = new Map([
  ['src/studio/desktop/internal/legacyname/legacyname.go', 'the migration: the old folder, key, track and file names it moves from'],
  ['src/studio/desktop/internal/legacyname/legacyname_test.go', "the migration's tests: a fake install from before the rename"],
  ['src/studio/integrations/reaper/narration_rename.lua', 'the migration of REAPER P_EXT keys in an open project'],
  ['src/studio/desktop/build/windows/installer/legacy.nsh', 'the migration of an install: its uninstall entry, program and shortcuts'],
  ['docs/operations/repository-rename.md', 'names the old GitHub repository, which a checkout or a session may still point at'],
]);

/** The line numbers (1-based) and lines of text that hold the old name. */
export function findOldName(text) {
  const hits = [];
  text.split('\n').forEach((line, index) => {
    if (OLD_NAME.test(line)) hits.push({ line: index + 1, text: line.trim().slice(0, 160) });
  });
  return hits;
}

/** Problems in the tracked files: an old name in a path or in the text of a file that is not allowed to hold it. */
export function checkTracked(files = trackedFiles(), texts = readTrackedText(files)) {
  const problems = [];
  for (const file of files) {
    if (ALLOWED.has(file)) continue;
    if (OLD_NAME.test(file)) problems.push(`${file}: the path holds the old name`);
    for (const hit of findOldName(texts.get(file) ?? '')) problems.push(`${file}:${hit.line}: ${hit.text}`);
  }
  for (const file of ALLOWED.keys()) {
    if (!files.includes(file)) problems.push(`${file} is allowed to hold the old name but is not tracked: remove it from ALLOWED`);
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
        if (bytes.includes(0)) continue; // a zip, an image or a program: its name was checked, its bytes are not text
        for (const hit of findOldName(bytes.toString('utf8'))) problems.push(`${name}:${hit.line}: ${hit.text}`);
      }
    }
  };
  walk(folder);
  return problems;
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
