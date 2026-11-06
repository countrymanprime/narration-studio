#!/usr/bin/env node
// Warns when a `fix` or `feat` pull request names no issue. A merged pull request that fixed an issue but never closed
// it leaves the issue open for good (31 of 110 open issues in docs/research/open-issue-triage-2026-11.md were already
// fixed). The description says what the pull request does to an issue:
//
//   Closes #<n>      the pull request fully resolves the issue (GitHub also accepts Fixes and Resolves)
//   Refs #<n>        it only touches the issue (Part of #<n> counts the same)
//   Issue: none — <reason>   there is no issue
//
// The check only warns: it prints a `::warning::` annotation and exits 0, because a title is not proof that an issue
// exists. It also warns when `Closes #<n>` is on a pull request whose base is not the default branch, because GitHub
// closes issues only on a merge into the default branch.
//
// CI:  PR_TITLE=… PR_BODY=… PR_BASE=… DEFAULT_BRANCH=… node scripts/ci/pr-issue-link.mjs [--summary]

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TITLE = /^(fix|feat)(\([^)]*\))?!?:/i;
const CLOSES = /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)[ \t]*:?[ \t]+#\d+/i;
const REFS = /\b(?:refs?|part of)[ \t]*:?[ \t]+#\d+/i;
const NONE = /^[ \t>*-]*Issue:[ \t]*none[ \t]*(?:[—–:-][ \t]*)?(.*)$/im;
const MIN_REASON_LENGTH = 8;

/** Text outside fenced code blocks, so an example in a description is not read as a link. */
function prose(body) {
  return (body ?? '').replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '');
}

/**
 * @param {{ title: string, body?: string, base?: string, defaultBranch?: string }} input
 * @returns {{ warnings: string[] }}
 */
export function evaluate({ title, body = '', base, defaultBranch = 'main' }) {
  const text = prose(body);
  const closes = CLOSES.test(text);
  const warnings = [];
  if (TITLE.test(title ?? '') && !closes && !REFS.test(text)) {
    const none = NONE.exec(text)?.[1]?.trim() ?? '';
    if (!NONE.test(text) || none.length < MIN_REASON_LENGTH) {
      warnings.push(
        'A fix or feat pull request names no issue. Add `Closes #<n>` if it fully resolves one, `Refs #<n>` if it only ' +
          'touches one, or `Issue: none — <reason>`.',
      );
    }
  }
  if (closes && base && base !== defaultBranch) {
    warnings.push(
      `This pull request closes an issue but its base is \`${base}\`, not \`${defaultBranch}\`. GitHub closes the issue only ` +
        'on a merge into the default branch, so the merger closes it by hand with a comment citing the pull request.',
    );
  }
  return { warnings };
}

function main() {
  const { warnings } = evaluate({
    title: process.env.PR_TITLE ?? '',
    body: process.env.PR_BODY ?? '',
    base: process.env.PR_BASE,
    defaultBranch: process.env.DEFAULT_BRANCH || 'main',
  });
  if (warnings.length === 0) {
    console.log('pr-issue-link: ok.');
    return 0;
  }
  for (const warning of warnings) console.log(`::warning title=Issue link::${warning}`);
  if (process.argv.includes('--summary') && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Issue link\n\n${warnings.map((w) => `- ${w}`).join('\n')}\n`);
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
