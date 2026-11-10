#!/usr/bin/env node
// Dependabot writes `chore(deps): Bump ...` (or `Update`) with a capital first word, copying the style of its last
// commit on main, and commitlint's subject-case rule forbids that. It also does not shorten a long `... in /dir` title.
// This fixes those two things, and only in Dependabot's exact title shape (a `deps` or `deps-dev` scope); any other title comes back unchanged, so a human's wrongly capitalized title still
// fails commitlint. Callers apply it only to pull requests authored by `dependabot[bot]`.
//
// CLI:  PR_TITLE=… node scripts/ci/dependabot-title.mjs   (prints the title to use)

import { fileURLToPath } from 'node:url';

const DEPENDABOT_TITLE = /^((?:build|chore|ci)\((?:deps|deps-dev)\): )(Bump|Update)( \S.*)$/;

const MAX_HEADER = 100; // commitlint's header-max-length
const DIRECTORY_SUFFIX = / in \/\S*$/;

/**
 * Lowercases the first word and, when the header is still over commitlint's 100 characters, drops the trailing
 * ` in /<directory>` (the branch name and the diff still say where). Other titles come back unchanged.
 * @param {string} title
 */
export function lowercaseDependabotTitle(title) {
  const m = DEPENDABOT_TITLE.exec(title);
  if (!m) return title;
  const fixed = `${m[1]}${m[2].toLowerCase()}${m[3]}`;
  return fixed.length > MAX_HEADER ? fixed.replace(DIRECTORY_SUFFIX, '') : fixed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${lowercaseDependabotTitle(process.env.PR_TITLE ?? '')}\n`);
}
