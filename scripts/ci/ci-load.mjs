#!/usr/bin/env node
// How many runner slots a pull request's checks hold, and for how long: per pull request, the jobs its head commit started (every
// workflow, the latest attempt of each run), how many of them got a runner, the most that ran at once, the runner minutes per OS and
// the CI wall clock. It is the before/after measure of the CI grouping work (#3065, docs/research/2026-11-06-ci-job-grouping.md).
//
//   node scripts/ci/ci-load.mjs pr <number>...           one row per pull request (its head commit's runs)
//   node scripts/ci/ci-load.mjs sha <sha>...             the same for commits (a branch pushed with workflow_dispatch runs)
//   node scripts/ci/ci-load.mjs merged [count]           the last <count> merged pull requests (default 30)
//   [--repo owner/name] [--json]
//
// It reads the Actions API through an authenticated GitHub CLI (`gh api`). A skipped job never gets a runner (GitHub reports it
// started and finished in the same second), so it is a check entry that holds no slot; it counts in `checks`, not in `ran`.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadBrand } from '../brand/brand.mjs';

const ms = (iso) => Date.parse(iso);

/** True when the job held a runner: it has a start and an end, they differ, and it was not skipped. */
export function heldRunner(job) {
  return Boolean(job.started_at && job.completed_at && job.conclusion !== 'skipped' && ms(job.completed_at) > ms(job.started_at));
}

/** `windows` or `linux` (every other hosted label in this repository is an Ubuntu image). */
export function runnerOs(job) {
  return (job.labels ?? []).some((label) => /windows/i.test(label)) ? 'windows' : 'linux';
}

/** The most intervals [from, to) open at one instant. An interval that ends when another starts does not overlap it. */
export function peakOverlap(intervals) {
  const events = [];
  for (const [from, to] of intervals) if (to > from) events.push([from, 1], [to, -1]);
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let peak = 0;
  for (const [, delta] of events) peak = Math.max(peak, (open += delta));
  return peak;
}

/** Minutes as GitHub bills them: each job's run time rounded up to a whole minute. */
export function billedMinutes(jobs) {
  return jobs.filter(heldRunner).reduce((sum, job) => sum + Math.ceil((ms(job.completed_at) - ms(job.started_at)) / 60000), 0);
}

/**
 * The runs that count for one commit: the newest run of each workflow (a newer push or a re-trigger replaces the older run), and of
 * that run only each job's latest attempt (`filter=all` also returns the attempts a re-run replaced).
 * @param {Array<{name: string, created_at: string, run_attempt: number, jobs: Array<object>}>} runs
 */
export function latestRuns(runs) {
  const newest = new Map();
  for (const run of runs) {
    const seen = newest.get(run.name);
    if (!seen || ms(run.created_at) > ms(seen.created_at)) newest.set(run.name, run);
  }
  // A job a re-run did not repeat keeps its first attempt's number, so the latest attempt is per job name, not the run's.
  return [...newest.values()].map((run) => {
    const attempt = new Map();
    for (const job of run.jobs) attempt.set(job.name, Math.max(attempt.get(job.name) ?? 0, job.run_attempt ?? 1));
    return { ...run, jobs: run.jobs.filter((job) => (job.run_attempt ?? 1) === attempt.get(job.name)) };
  });
}

/** One row of the load table for a commit's runs. */
export function load(runs) {
  const latest = latestRuns(runs);
  const jobs = latest.flatMap((run) => run.jobs);
  const ran = jobs.filter(heldRunner);
  const ci = latest.find((run) => run.name === 'CI');
  const ciEnd = ci ? Math.max(...ci.jobs.filter((job) => job.completed_at).map((job) => ms(job.completed_at))) : NaN;
  return {
    workflows: latest.length,
    checks: jobs.length,
    ran: ran.length,
    ranWindows: ran.filter((job) => runnerOs(job) === 'windows').length,
    peakRunning: peakOverlap(ran.map((job) => [ms(job.started_at), ms(job.completed_at)])),
    // Queued time included: what the commit asked of the account's concurrency, whether or not a runner was free.
    // A re-run's job can carry a created_at after its start; the earlier of the two is when it asked for a runner.
    peakDemand: peakOverlap(ran.map((job) => [Math.min(ms(job.created_at ?? job.started_at), ms(job.started_at)), ms(job.completed_at)])),
    minutesLinux: billedMinutes(ran.filter((job) => runnerOs(job) === 'linux')),
    minutesWindows: billedMinutes(ran.filter((job) => runnerOs(job) === 'windows')),
    ciTier: ci ? (ci.jobs.some((job) => job.name.endsWith('CI passed') && heldRunner(job)) ? 'full' : 'light') : '-',
    ciWallMinutes: Number.isFinite(ciEnd) ? Math.round((ciEnd - ms(ci.created_at)) / 6000) / 10 : null,
  };
}

const COLUMNS = ['label', 'ciTier', 'workflows', 'checks', 'ran', 'ranWindows', 'peakRunning', 'peakDemand', 'minutesLinux', 'minutesWindows', 'ciWallMinutes'];

/** A Markdown table, then the median of each numeric column over the rows of the full tier. */
export function render(rows) {
  const lines = [`| ${COLUMNS.join(' | ')} |`, `| ${COLUMNS.map(() => '---').join(' | ')} |`];
  for (const row of rows) lines.push(`| ${COLUMNS.map((column) => row[column] ?? '-').join(' | ')} |`);
  const full = rows.filter((row) => row.ciTier === 'full');
  if (full.length) {
    const median = (column) => {
      const values = full.map((row) => row[column]).filter((value) => typeof value === 'number').sort((a, b) => a - b);
      return values.length ? values[Math.floor(values.length / 2)] : '-';
    };
    lines.push(`| median of ${full.length} full | full | ${COLUMNS.slice(2).map(median).join(' | ')} |`);
  }
  return lines.join('\n');
}

function gh(path) {
  // Pages by hand: `--paginate` follows `Link` headers, which some proxies refuse (numeric repository ids).
  const pages = [];
  for (let page = 1; page <= 10; page += 1) {
    const body = JSON.parse(execFileSync('gh', ['api', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
    pages.push(body);
    if ((body.workflow_runs ?? body.jobs ?? body).length < 100) break;
  }
  return pages;
}

function runsOf(repo, sha) {
  return gh(`repos/${repo}/actions/runs?head_sha=${sha}`)
    .flatMap((page) => page.workflow_runs)
    .map((run) => ({ ...run, jobs: gh(`repos/${repo}/actions/runs/${run.id}/jobs?filter=all`).flatMap((page) => page.jobs) }));
}

function main(argv) {
  const repoIndex = argv.indexOf('--repo');
  const repo = repoIndex >= 0 ? argv[repoIndex + 1] : (process.env.GITHUB_REPOSITORY ?? loadBrand().repository.slug);
  const positional = argv.filter((arg, index) => !arg.startsWith('--') && (repoIndex < 0 || index !== repoIndex + 1));
  const [mode, ...rest] = positional;
  let targets;
  if (mode === 'pr') targets = rest.map((number) => ({ label: `#${number}`, sha: JSON.parse(execFileSync('gh', ['api', `repos/${repo}/pulls/${number}`], { encoding: 'utf8' })).head.sha }));
  else if (mode === 'sha') targets = rest.map((sha) => ({ label: sha.slice(0, 9), sha }));
  else if (mode === 'merged') {
    const count = Number(rest[0] ?? 30);
    const closed = gh(`repos/${repo}/pulls?state=closed&sort=updated&direction=desc`).flat();
    targets = closed
      .filter((pr) => pr.merged_at)
      .sort((a, b) => ms(b.merged_at) - ms(a.merged_at))
      .slice(0, count)
      .map((pr) => ({ label: `#${pr.number}`, sha: pr.head.sha }));
  } else {
    console.error('Usage: ci-load.mjs pr <number>... | sha <sha>... | merged [count]  [--repo owner/name] [--json]');
    process.exit(2);
  }
  const rows = targets.map((target) => ({ label: target.label, ...load(runsOf(repo, target.sha)) }));
  console.log(argv.includes('--json') ? JSON.stringify(rows, null, 2) : render(rows));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
