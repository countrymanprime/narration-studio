#!/usr/bin/env node
// Fails when a change touches a page's UI code and neither that page's how-to guide (docs/guides/using-the-app/<page>.md)
// nor any guide image (docs/images/ui/) changed. The guide shows how to use each page, so the change that alters a page
// updates its guide text and screenshots (node scripts/dev/guide-screenshots.mjs <page>). `guide-impact-map.json` maps
// UI folders to guide pages. A change that alters nothing a reader of the guide sees says so with a line
// `No guide change: <reason>` in the pull request description (CI passes it as $PR_BODY) or in a commit message.
//
// pnpm check / CI:  node scripts/ci/guide-impact.mjs [--base REF] [--summary]
//
// A path check cannot tell whether the right screenshot changed; review does that.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesAny } from './docs-impact.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const GUIDE = 'docs/guides/using-the-app/';
const IMAGES = 'docs/images/ui/**';

const MIN_REASON_LENGTH = 12;
const VAGUE_REASON = /^(n\/?a|none|nothing|not (needed|required|applicable)|skip(ped)?|trivial|minor)\.?$/i;
const OPT_OUT_LINE = /^[ \t>*-]*No guide change:[ \t]*(.+)$/im;

export function loadMap() {
  return JSON.parse(readFileSync(join(HERE, 'guide-impact-map.json'), 'utf8'));
}

/** The reason from a `No guide change: <reason>` line, or undefined when absent or too vague to count. */
export function findOptOut(text) {
  const reason = OPT_OUT_LINE.exec(text ?? '')?.[1]?.trim();
  if (!reason || reason.length < MIN_REASON_LENGTH || VAGUE_REASON.test(reason)) return undefined;
  return reason;
}

/**
 * @param {{ changed: string[], map: { exclude: string[], rules: object[] }, text?: string }} input
 * @returns {{ violations: { id: string, files: string[], guide: string[] }[], waivedBy?: string }}
 */
export function evaluate({ changed, map, text = '' }) {
  const imagesChanged = changed.some((file) => matchesAny(file, [IMAGES]));
  const violations = [];
  for (const rule of map.rules) {
    const files = changed.filter((file) => matchesAny(file, rule.paths) && !matchesAny(file, map.exclude));
    if (files.length === 0 || imagesChanged) continue;
    if (changed.some((file) => matchesAny(file, rule.guide.map((page) => GUIDE + page)))) continue;
    violations.push({ id: rule.id, files, guide: rule.guide });
  }
  if (violations.length === 0) return { violations };
  const waivedBy = findOptOut(text);
  return waivedBy ? { violations: [], waivedBy } : { violations };
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function main() {
  const args = process.argv.slice(2);
  const baseFlag = args.indexOf('--base');
  const base = baseFlag !== -1 ? args[baseFlag + 1] : process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
  let changed;
  let commits;
  try {
    const mergeBase = git(['merge-base', base, 'HEAD']).trim();
    const tracked = git(['diff', '--name-only', '--no-renames', '-z', mergeBase]).split('\0');
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0');
    changed = [...new Set([...tracked, ...untracked].filter(Boolean))];
    commits = git(['log', '--format=%B', `${mergeBase}..HEAD`]);
  } catch (error) {
    console.error(`guide-impact: cannot compare against ${base} (${error.message.split('\n')[0]}). Fetch it, or pass --base.`);
    return 2;
  }

  const { violations, waivedBy } = evaluate({ changed, map: loadMap(), text: `${process.env.PR_BODY ?? ''}\n${commits}` });
  if (violations.length === 0) {
    console.log(waivedBy ? `guide-impact: guide unchanged; waived: ${waivedBy}` : 'guide-impact: ok.');
    return 0;
  }
  const list = violations
    .map(({ id, files, guide }) => `  ${id}: changed ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` and ${files.length - 3} more` : ''}\n    update ${guide.map((page) => GUIDE + page).join(' or ')}`)
    .join('\n');
  const message =
    `guide-impact: a page's UI changed and its how-to guide did not.\n${list}\n` +
    'Update the page\'s guide text and its screenshots (node scripts/dev/guide-screenshots.mjs <page>), or, if nothing a reader of ' +
    'the guide sees or does changed, add a line `No guide change: <specific reason>` to the pull request description.';
  console.error(message);
  if (args.includes('--summary') && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Guide impact\n\n\`\`\`\n${message}\n\`\`\`\n`);
  }
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
