#!/usr/bin/env node
// Picks the CodeQL languages a pull request needs to analyse, so a Go-only change does not pay for the JavaScript and
// Python databases as well.
//
// git diff --name-only HEAD^1 HEAD | node scripts/ci/codeql-scope.mjs    Prints a matrix as JSON: {"include": [...]}.
// node scripts/ci/codeql-scope.mjs --all                                  The matrix of every language (push, schedule, manual).
//
// A language is analysed when a file CodeQL extracts for it changed: its sources for the build-less languages, the
// desktop module and the toolchain pin for Go (built by hand). A change to the workflow or to the toolchain action
// that sets Go up changes every language's analysis, and a diff that could not be read (an empty list) runs all three:
// the gate fails open, never closed.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const LANGUAGES = [
  { language: 'go', 'build-mode': 'manual', owns: /^src\/studio\/desktop\/|^scripts\/toolchain\.json$/ },
  { language: 'javascript-typescript', 'build-mode': 'none', owns: /\.(?:[cm]?[jt]sx?|vue|html?)$/ },
  { language: 'python', 'build-mode': 'none', owns: /\.pyi?$/ },
];

const EVERY_LANGUAGE = /^\.github\/(?:workflows\/codeql\.yml$|actions\/setup-toolchain\/|codeql\/)|^scripts\/ci\/codeql-scope\./;

const entry = ({ language, 'build-mode': buildMode }) => ({ language, 'build-mode': buildMode });

/** The matrix `include` rows for the changed paths: every language when a path is unknown or shared. */
export function matrixFor(paths) {
  const changed = paths.map((path) => path.trim().replaceAll('\\', '/')).filter(Boolean);
  if (changed.length === 0 || changed.some((path) => EVERY_LANGUAGE.test(path))) return LANGUAGES.map(entry);
  return LANGUAGES.filter(({ owns }) => changed.some((path) => owns.test(path))).map(entry);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const paths = process.argv.includes('--all') ? [] : readFileSync(0, 'utf8').split('\n');
  process.stdout.write(`${JSON.stringify({ include: matrixFor(paths) })}\n`);
}
