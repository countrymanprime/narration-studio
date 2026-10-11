#!/usr/bin/env node
// Records that the full gate (`pnpm check`) passed on an exact working tree, and blocks a Claude Code stop that
// leaves changed code without that record.
//
// node scripts/ci/gate-stamp.mjs record   Writes the hash of the current working tree. `pnpm check` calls it last.
// node scripts/ci/gate-stamp.mjs --hook   Claude Code Stop and SubagentStop hook. Reads the payload on stdin.
//   Exit 2 blocks the stop and shows the reason to the agent. It lets the stop through when stop_hook_active is
//   set (an agent that cannot satisfy it is not trapped in a loop), when only docs or agent config changed, and
//   when git cannot answer. A run that deliberately skips the full gate (an agent-train worker runs the targeted
//   set its template names) says so in its last message with `Gate: skipped — <reason>`.
//
// The hash covers tracked, staged and untracked files but not ignored ones, so committing after a green check
// keeps the stamp valid and any later edit invalidates it.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const STAMP_FILE = join(REPO_ROOT, '.cache', 'gate-pass.json');

const MIN_REASON_LENGTH = 12;
const OPT_OUT_LINE = /^[ \t]*Gate:[ \t]*skipped[ \t]*[—–-]+[ \t]*(.+)$/im;
// Paths whose change the full gate does not exist to protect: prose, the agent's own config and scratch output.
const EXEMPT = [/^docs\//, /\.md$/, /^\.claude\//, /^\.cache\//];

function git(args, env = {}) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } });
}

/** The tree hash of everything not ignored, taken through a throwaway index so the real one is untouched. */
function workingTreeHash() {
  const dir = mkdtempSync(join(tmpdir(), 'gate-index-'));
  try {
    const env = { GIT_INDEX_FILE: join(dir, 'index') };
    git(['add', '-A'], env);
    return git(['write-tree'], env).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The reason from a `Gate: skipped — <reason>` line, or undefined when absent or too short to count. */
export function findOptOut(text) {
  const reason = OPT_OUT_LINE.exec(text ?? '')?.[1]?.trim();
  return reason && reason.length >= MIN_REASON_LENGTH ? reason : undefined;
}

/** Files whose change the full gate protects. */
export function gatedFiles(changed) {
  return changed.filter((file) => !EXEMPT.some((pattern) => pattern.test(file)));
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

/**
 * @param {{ changed: string[], stampedHash?: string, currentHash: string, lastMessage?: string }} input
 * @returns {{ block: boolean, reason?: string, waivedBy?: string }}
 */
export function decide({ changed, stampedHash, currentHash, lastMessage = '' }) {
  const gated = gatedFiles(changed);
  if (gated.length === 0) return { block: false };
  if (stampedHash === currentHash) return { block: false };
  const waivedBy = findOptOut(lastMessage);
  if (waivedBy) return { block: false, waivedBy };
  const shown = gated.slice(0, 3).join(', ') + (gated.length > 3 ? ` and ${gated.length - 3} more` : '');
  return {
    block: true,
    reason:
      `gate-stamp: code changed (${shown}) and \`pnpm check\` has not passed on this exact tree` +
      (stampedHash ? ' (it passed on an earlier one, so something changed since).' : '.') +
      ' Run `pnpm check` (the full gate, see the full-verification-gate skill). If this run deliberately uses a ' +
      'targeted set instead, say `Gate: skipped — <specific reason>` in your final message.',
  };
}

function readStamp() {
  try {
    return JSON.parse(readFileSync(STAMP_FILE, 'utf8')).tree;
  } catch {
    return undefined;
  }
}

function changedFiles(mergeBase) {
  const tracked = git(['diff', '--name-only', '--no-renames', '-z', mergeBase]).split('\0');
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0');
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'record') {
    mkdirSync(dirname(STAMP_FILE), { recursive: true });
    writeFileSync(STAMP_FILE, `${JSON.stringify({ tree: workingTreeHash(), at: new Date().toISOString() })}\n`);
    console.log('gate-stamp: recorded a full-gate pass for this tree.');
    return 0;
  }
  if (!args.includes('--hook')) {
    console.error('usage: gate-stamp.mjs record | --hook');
    return 2;
  }
  const input = parseHookInput(readFileSync(0, 'utf8'));
  if (input.active) return 0;
  let result;
  try {
    const mergeBase = git(['merge-base', 'origin/main', 'HEAD']).trim();
    result = decide({ changed: changedFiles(mergeBase), stampedHash: readStamp(), currentHash: workingTreeHash(), lastMessage: input.lastMessage });
  } catch {
    return 0;
  }
  if (!result.block) return 0;
  console.error(result.reason);
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
