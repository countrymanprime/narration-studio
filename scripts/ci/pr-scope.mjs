// What a pull request touched, for the gates that used to count the whole repository (coverage floors, pyright limits).
// On a pull request a gate fails only for what the change reaches; on any other CI event (main-health, a push) it reports, and
// a run outside CI (GITHUB_EVENT_NAME unset, `pnpm check`) stays strict.
import { spawnSync } from 'node:child_process';

/** The files the pull request changes against its base, or null when this run is not a pull request in CI. */
export function changedFiles(env = process.env, git = (args) => spawnSync('git', args, { encoding: 'utf8' })) {
  if (env.GITHUB_EVENT_NAME !== 'pull_request' || !env.GITHUB_BASE_REF) return null;
  const run = git(['diff', '--name-only', `origin/${env.GITHUB_BASE_REF}...HEAD`]);
  if (run.status !== 0) throw new Error(`git diff against origin/${env.GITHUB_BASE_REF} failed: ${run.stderr}`);
  return run.stdout.split(/\r?\n/).filter(Boolean);
}

/** The gating mode: 'strict' (local), 'scoped' (pull request, fail only what it touches) or 'report' (other CI events). */
export function modeFor(env = process.env) {
  if (!env.GITHUB_EVENT_NAME) return 'strict';
  return env.GITHUB_EVENT_NAME === 'pull_request' ? 'scoped' : 'report';
}

export const under = (file, directory) => directory === '.' || directory === '' || file === directory || file.startsWith(`${directory.replace(/\/$/, '')}/`);
