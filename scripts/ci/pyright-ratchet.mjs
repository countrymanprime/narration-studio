#!/usr/bin/env node
// Python types only ratchet down: pyright (pyrightconfig.json, basic mode) may report no more errors in a directory than
// scripts/ci/pyright-ratchet.json allows, and a directory that reaches fewer must write the lower number down.
//
// node scripts/ci/pyright-ratchet.mjs            Checks the counts; exit 1 on a directory above (or below) its number.
// node scripts/ci/pyright-ratchet.mjs --update   Lowers the numbers to what pyright reports; never raises one.
//
// Scope (#3149): two merges that each passed can leave a count off its limit on `main`, and then every later pull request went red
// for errors it did not write. On a pull request a directory that differs from its limit fails only when the change touches a
// file in it (over: the new errors; under: write the lower number down, so headroom is not left for later errors). Other
// directories, and every directory on other CI events, are printed as warnings; a local run stays strict.
//
// A new Python directory is added to pyrightconfig.json and starts at its real count, or at 0 when it is clean. A directory in the
// config with no entry here fails, so a directory cannot be checked without being ratcheted (issue #946).

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { changedFiles, modeFor, under } from './pr-scope.mjs';

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const LIMITS_FILE = 'scripts/ci/pyright-ratchet.json';
const posix = (path) => path.split('\\').join('/');

/** Error counts per ratcheted directory: each error goes to the longest directory that contains its file. */
export function countByDirectory(diagnostics, directories, repoRoot = root) {
  const counts = Object.fromEntries(directories.map((directory) => [directory, 0]));
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== 'error') continue;
    const file = posix(relative(repoRoot, diagnostic.file));
    const owner = directories.filter((directory) => file === directory || file.startsWith(`${directory}/`)).sort((a, b) => b.length - a.length)[0];
    if (owner === undefined) throw new Error(`pyright reported ${file}, which is in no directory of ${LIMITS_FILE}`);
    counts[owner] += 1;
  }
  return counts;
}

/** One message per directory whose count differs from its limit, and the limits lowered to the counts. */
export function evaluate(counts, limits, { mode = 'strict', files = null } = {}) {
  const problems = [];
  const warnings = [];
  const gated = (directory) => mode === 'strict' || (mode === 'scoped' && (files === null || files.some((file) => under(file, directory))));
  const flag = (directory, message) => (gated(directory) ? problems : warnings).push(message);
  const lowered = { ...limits };
  for (const directory of Object.keys(counts).sort()) {
    if (!(directory in limits)) problems.push(`${directory}: checked by pyright but missing from ${LIMITS_FILE}; add it at ${counts[directory]}`);
    else if (counts[directory] > limits[directory]) flag(directory, `${directory}: ${counts[directory]} errors, over the limit of ${limits[directory]}; fix the new ones`);
    else if (counts[directory] < limits[directory]) {
      flag(directory, `${directory}: ${counts[directory]} errors, under the limit of ${limits[directory]}; run node scripts/ci/pyright-ratchet.mjs --update`);
      lowered[directory] = counts[directory];
    }
  }
  for (const directory of Object.keys(limits)) {
    if (!(directory in counts)) problems.push(`${directory}: in ${LIMITS_FILE} but not checked by pyrightconfig.json; remove it or add it to the config`);
  }
  return { problems, lowered, warnings };
}

function main() {
  const limits = JSON.parse(readFileSync(join(root, LIMITS_FILE), 'utf8'));
  const config = JSON.parse(readFileSync(join(root, 'pyrightconfig.json'), 'utf8'));
  const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'pyright.CMD' : 'pyright');
  const run = spawnSync(bin, ['--outputjson'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' });
  if (run.error || !run.stdout) {
    console.error(`pyright did not run: ${run.error?.message ?? run.stderr}`);
    process.exit(2);
  }
  const report = JSON.parse(run.stdout);
  const counts = countByDirectory(report.generalDiagnostics, config.include.map(posix));
  const mode = modeFor();
  const { problems, lowered, warnings } = evaluate(counts, limits, { mode, files: mode === 'scoped' ? changedFiles() : null });
  for (const warning of warnings) console.log(`::warning::pyright: ${warning} (not gated here)`);
  if (process.argv.includes('--update')) {
    const raises = Object.keys(counts).filter((directory) => !(directory in limits) || counts[directory] > limits[directory]);
    if (raises.length) {
      console.error(`--update only lowers: ${raises.join(', ')} are over their limit or missing; fix or add them by hand.`);
      process.exit(1);
    }
    writeFileSync(join(root, LIMITS_FILE), `${JSON.stringify(Object.fromEntries(Object.entries(lowered).sort()), null, 2)}\n`);
    console.log(`pyright limits written: ${JSON.stringify(lowered)}`);
    return;
  }
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exit(1);
  console.log(`pyright: ${Object.entries(counts).map(([directory, count]) => `${directory} ${count}`).join(', ')} (at their limits)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
