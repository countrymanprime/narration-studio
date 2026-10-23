#!/usr/bin/env node
// The product's earlier name was retired before the first public release (owner decision, 2026-10-23), with no migration and no
// exception: it may not appear in a tracked file's path or text, in the built site, or in a release asset's name.
//
//   node scripts/ci/old-name.mjs              every tracked file (path and text)
//   node scripts/ci/old-name.mjs <dir>...     every file under these folders as well (the built site, dist-site; a release's bin folder)
//
// The name is written here in pieces, so this file does not match itself.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Any spelling: narration-…, narration_…, Narration …, Narration… in one word, in any case.
export const OLD_NAME = new RegExp(['narration', '[-_ ]?', 'util', 's'].join(''), 'i');

/** Each hit as `<where>:<line>: <text>`, or `<where>: (in the path)`, from a file's path and text. */
export function findIn(where, text) {
  const hits = OLD_NAME.test(where) ? [`${where}: (in the path)`] : [];
  if (text === null) return hits;
  text.split(/\r?\n/).forEach((line, index) => {
    if (OLD_NAME.test(line)) hits.push(`${where}:${index + 1}: ${line.trim().slice(0, 160)}`);
  });
  return hits;
}

function textOf(path) {
  const buffer = readFileSync(path);
  // A binary file is checked by its name only; its bytes are compared as Latin-1 so a name inside an archive still shows.
  return buffer.includes(0) ? buffer.toString('latin1') : buffer.toString('utf8');
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** Every hit in the tracked files, and in the files under `dirs`. */
export function scan(dirs = []) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean);
  const hits = [];
  for (const file of tracked) {
    let text = null;
    try {
      text = textOf(join(REPO_ROOT, file));
    } catch {
      // Listed but deleted in the working tree: only the path is left to check.
    }
    hits.push(...findIn(file, text));
  }
  for (const dir of dirs) {
    if (!statSync(dir).isDirectory()) throw new Error(`${dir} is not a folder`);
    for (const file of walk(dir)) hits.push(...findIn(relative(REPO_ROOT, file), textOf(file)));
  }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hits = scan(process.argv.slice(2));
  for (const hit of hits) console.log(hit);
  if (hits.length > 0) {
    console.error(`old-name: the retired product name appears ${hits.length} time(s); the product is Narration Studio (narration-studio, NarrationStudio).`);
    process.exit(1);
  }
  console.log('old-name: none found.');
}
