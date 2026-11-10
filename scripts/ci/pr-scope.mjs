// What a pull request touched, for the gates that used to count the whole repository (coverage floors, pyright limits).
// On a pull request a gate fails only for what the change reaches. Every other run (main-health, a push, `pnpm check`) stays strict,
// so a floor or limit actually missed on `main` still turns main-health red.
import { spawnSync } from 'node:child_process';

/**
 * The files the pull request changes against its base, or null when this run is not a pull request in CI or the base cannot be
 * reached (a shallow checkout such as the `CI passed` job's has no `origin/<base>`: fetch it once; if that fails too the caller
 * treats everything as touched, the strict direction, never as a CI error).
 */
export function changedFiles(env = process.env, git = (args) => spawnSync('git', args, { encoding: 'utf8' })) {
  if (env.GITHUB_EVENT_NAME !== 'pull_request' || !env.GITHUB_BASE_REF) return null;
  const range = `origin/${env.GITHUB_BASE_REF}...HEAD`;
  let run = git(['diff', '--name-only', range]);
  if (run.status !== 0) {
    // Three dots need the merge base, so fetch enough history for it, as the full-history checkouts of the other jobs have.
    git(['fetch', '--no-tags', '--quiet', '--unshallow', 'origin', env.GITHUB_BASE_REF]);
    run = git(['diff', '--name-only', range]);
  }
  if (run.status !== 0) {
    console.log(`::warning::pr-scope: cannot diff against origin/${env.GITHUB_BASE_REF} (${String(run.stderr).trim().split('\n')[0]}); gating every directory`);
    return null;
  }
  return run.stdout.split(/\r?\n/).filter(Boolean);
}

/** The gating mode: 'scoped' on a pull request (fail only what it touches), 'strict' everywhere else. */
export function modeFor(env = process.env) {
  return env.GITHUB_EVENT_NAME === 'pull_request' ? 'scoped' : 'strict';
}

export const under = (file, directory) => directory === '.' || directory === '' || file === directory || file.startsWith(`${directory.replace(/\/$/, '')}/`);
