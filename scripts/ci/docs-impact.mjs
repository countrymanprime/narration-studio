#!/usr/bin/env node
// Fails when a change touches code that docs/ describe and touches none of those docs (issue #943).
//
// `docs-impact-map.json` lists code paths and the docs a change to them owes. A rule holds when the change also
// touches any one of its docs. A change that owes no doc says so with a `Docs: none — <reason>` line in the pull
// request description (CI passes it as $PR_BODY) or in a commit message in the range. A vague reason does not count.
//
// pnpm check / CI:  node scripts/ci/docs-impact.mjs [--base REF] [--summary]
// Claude Code Stop and SubagentStop hook:  node scripts/ci/docs-impact.mjs --hook
//   Reads the hook payload on stdin. Exit 2 blocks the stop and shows the reason to the agent. It lets the stop
//   through when stop_hook_active is set (so an agent that cannot satisfy it is not trapped in a loop) and when git
//   cannot answer. The agent states the opt-out line in its last message.
//
// A path check cannot tell a real doc update from an empty edit; doc-impact-check and review cover that.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const MAP_FILE = join(HERE, 'docs-impact-map.json');

const MIN_REASON_LENGTH = 12;
const VAGUE_REASON = /^(n\/?a|none|nothing|no docs?|not (needed|required|applicable)|skip(ped)?|trivial|minor)\.?$/i;
const OPT_OUT_LINE = /^[ \t]*Docs:[ \t]*none[ \t]*[—–-]+[ \t]*(.+)$/im;

// Turns a glob into an anchored RegExp: `*` stays inside one folder, a double star crosses folders, and a double
// star followed by a slash may also match no folder at all.
export function globToRegExp(glob) {
  let source = '';
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      if (glob[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else {
      source += char.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

export function matchesAny(file, globs) {
  return globs.some((glob) => globToRegExp(glob).test(file));
}

export function loadRules() {
  return JSON.parse(readFileSync(MAP_FILE, 'utf8')).rules;
}

/** The reason from a `Docs: none — <reason>` line, or undefined when absent or too vague to count. */
export function findOptOut(text) {
  const reason = OPT_OUT_LINE.exec(text ?? '')?.[1]?.trim();
  if (!reason || reason.length < MIN_REASON_LENGTH || VAGUE_REASON.test(reason)) return undefined;
  return reason;
}

/**
 * @param {{ changed: string[], rules: object[], text?: string }} input `text` is where an opt-out line may sit.
 * @returns {{ violations: { id: string, files: string[], docs: string[] }[], waivedBy?: string }}
 */
export function evaluate({ changed, rules, text = '' }) {
  const violations = [];
  for (const rule of rules) {
    const files = changed.filter((file) => matchesAny(file, rule.paths) && !matchesAny(file, rule.exclude ?? []));
    if (files.length === 0) continue;
    if (changed.some((file) => matchesAny(file, rule.docs))) continue;
    violations.push({ id: rule.id, files, docs: rule.docs });
  }
  if (violations.length === 0) return { violations };
  const waivedBy = findOptOut(text);
  return waivedBy ? { violations: [], waivedBy } : { violations };
}

/** Reads a Stop or SubagentStop hook payload. Anything unreadable counts as an inactive hook with no message. */
export function parseHookInput(raw) {
  try {
    const payload = JSON.parse(raw);
    return { active: payload.stop_hook_active === true, lastMessage: String(payload.last_assistant_message ?? '') };
  } catch {
    return { active: false, lastMessage: '' };
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Files changed since `base`: committed, staged, unstaged and untracked. `--no-renames` lists a moved file's old path too. */
function changedFiles(mergeBase) {
  const tracked = git(['diff', '--name-only', '--no-renames', '-z', mergeBase]).split('\0');
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0');
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}

function describe(violations) {
  return violations
    .map(
      ({ id, files, docs }) =>
        `  ${id}: changed ${files.slice(0, 3).join(', ')}${files.length > 3 ? ` and ${files.length - 3} more` : ''}\n    update one of: ${docs.join(', ')}`,
    )
    .join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const hook = args.includes('--hook');
  const baseFlag = args.indexOf('--base');
  const base = baseFlag !== -1 ? args[baseFlag + 1] : process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
  const input = hook ? parseHookInput(readFileSync(0, 'utf8')) : { active: false, lastMessage: '' };
  if (input.active) return 0;

  let mergeBase;
  let changed;
  let commits = '';
  try {
    mergeBase = git(['merge-base', base, 'HEAD']).trim();
    changed = changedFiles(mergeBase);
    commits = git(['log', '--format=%B', `${mergeBase}..HEAD`]);
  } catch (error) {
    if (hook) return 0;
    console.error(`docs-impact: cannot compare against ${base} (${error.message.split('\n')[0]}). Fetch it, or pass --base.`);
    return 2;
  }

  const text = [process.env.PR_BODY ?? '', commits, input.lastMessage].join('\n');
  const { violations, waivedBy } = evaluate({ changed, rules: loadRules(), text });

  if (violations.length === 0) {
    console.log(waivedBy ? `docs-impact: no doc updated; waived: ${waivedBy}` : `docs-impact: ok (${changed.length} file(s) changed against ${base}).`);
    return 0;
  }

  const message =
    `docs-impact: code changed without the docs that describe it.\n${describe(violations)}\n` +
    'Update the doc (see the doc-impact-check skill), or if no documented behaviour, command or boundary changed, ' +
    'add a line `Docs: none — <specific reason>` to the pull request description' +
    (hook ? ' and repeat it in your final message.' : ' or a commit message.');
  console.error(message);
  if (!hook && args.includes('--summary') && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Docs impact\n\n\`\`\`\n${message}\n\`\`\`\n`);
  }
  return hook ? 2 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
