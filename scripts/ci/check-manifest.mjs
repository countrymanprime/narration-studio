#!/usr/bin/env node
// Where every check of the pull-request CI runs: scripts/ci/check-manifest.json maps each check that ran on 2026-11-06 (#3065) to
// the job and step that run it now. Regrouping jobs moves steps between jobs; this keeps a check from being lost on the way.
//
//   node scripts/ci/check-manifest.mjs           prints the table (check, was, tier, now) and exits 1 on any problem
//
// The workflow files are read as text, not parsed as YAML (the repository has no YAML parser among its root dependencies): a job is
// the lines from `  <id>:` under `jobs:` to the next job, a step is the lines from a `      - ` item of the job's `steps:` to the next
// one, and comment lines are dropped first so a comment cannot stand in for a step. scripts/ci/check-manifest.test.mjs runs it.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = join(ROOT, 'scripts', 'ci', 'check-manifest.json');
const WORKFLOWS = join(ROOT, '.github', 'workflows');

/** The workflow's text without full-line comments. */
function stripComments(text) {
  return text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

/** The lines of job `id` (its header included), or null when the workflow has no such job. */
export function jobBlock(text, id) {
  const lines = stripComments(text).split('\n');
  const jobsAt = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsAt < 0) return null;
  const start = lines.findIndex((line, index) => index > jobsAt && line === `  ${id}:`);
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^ {2}[\w-]+:\s*$/.test(lines[index]) || /^\S/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** The steps of a job block, each as its text. */
export function stepBlocks(job) {
  const steps = [];
  let current = null;
  for (const line of job.split('\n')) {
    if (/^ {6}- /.test(line)) {
      current = [line];
      steps.push(current);
    } else if (current && (/^ {8}/.test(line) || line.trim() === '')) {
      current.push(line);
    } else {
      current = null;
    }
  }
  return steps.map((step) => step.join('\n'));
}

/** The job ids a job lists under `needs:` (one line, list or scalar form). */
export function needsOf(job) {
  const match = /^ {4}needs:\s*(.+)$/m.exec(job ?? '');
  if (!match) return [];
  return match[1].replace(/[[\]]/g, '').split(',').map((need) => need.trim()).filter(Boolean);
}

/** True when the workflow runs on a push to main or on a schedule, or is ci.yml / _quality.yml (main-health calls ci.yml). */
function runsAfterMerge(file, text) {
  if (file === 'ci.yml' || file === '_quality.yml') return true;
  const body = stripComments(text);
  return /^\s{2}schedule:/m.test(body) || /^\s{2}push:\s*\n\s{4}branches:\s*\[[^\]]*\bmain\b/m.test(body);
}

/** True when the workflow runs on pull requests (directly, or _quality.yml / _ui-dist.yml through ci.yml). */
function runsOnPullRequests(file, text) {
  if (file === '_quality.yml' || file === '_ui-dist.yml') return true;
  return /^\s{2}pull_request:/m.test(stripComments(text));
}

/**
 * The problems with one manifest entry, as sentences; none when its check is where the manifest says.
 * @param {object} entry  @param {(file: string) => string} read  @param {(name: string) => string} [readAction]
 */
export function problems(entry, read, readAction = readLocalAction) {
  const found = [];
  let text;
  try {
    text = read(entry.workflow);
  } catch {
    return [`${entry.id}: workflow ${entry.workflow} does not exist`];
  }
  const job = jobBlock(text, entry.job);
  if (!job) return [`${entry.id}: ${entry.workflow} has no job ${entry.job}`];
  if (entry.step?.length && !stepBlocks(job).some((step) => entry.step.every((needle) => step.includes(needle)))) {
    found.push(`${entry.id}: no step of ${entry.workflow}#${entry.job} contains all of ${JSON.stringify(entry.step)}`);
  }
  for (const needle of entry.job_has ?? []) {
    if (!job.includes(needle)) found.push(`${entry.id}: ${entry.workflow}#${entry.job} does not contain ${JSON.stringify(needle)}`);
  }
  // A check that runs inside a local composite action the step uses: the action must still hold it.
  for (const [action, needles] of Object.entries(entry.action_has ?? {})) {
    let body;
    try {
      body = stripComments(readAction(action));
    } catch {
      found.push(`${entry.id}: action ${action} does not exist`);
      continue;
    }
    for (const needle of needles) if (!body.includes(needle)) found.push(`${entry.id}: action ${action} does not contain ${JSON.stringify(needle)}`);
  }
  if (entry.tier === 'pr') {
    if (!runsOnPullRequests(entry.workflow, text)) found.push(`${entry.id}: tier pr, but ${entry.workflow} has no pull_request trigger`);
    // A job of ci.yml that is not an aggregate must be one `CI passed` waits for, or its failure would not turn `CI passed` red.
    if (entry.workflow === 'ci.yml' && !['ci-passed', 'ci-light-passed'].includes(entry.job) && !needsOf(jobBlock(text, 'ci-passed')).includes(entry.job)) {
      found.push(`${entry.id}: ci.yml#${entry.job} is not in the needs of ci-passed`);
    }
  } else if (entry.tier === 'post-merge' || entry.tier === 'scheduled') {
    if (!entry.safety_net || entry.safety_net.trim().length < 20) found.push(`${entry.id}: deferred to ${entry.tier} without a safety_net`);
    if (!runsAfterMerge(entry.workflow, text)) found.push(`${entry.id}: tier ${entry.tier}, but ${entry.workflow} runs neither on a push to main nor on a schedule`);
  } else {
    found.push(`${entry.id}: unknown tier ${JSON.stringify(entry.tier)}`);
  }
  return found;
}

export function loadManifest(path = MANIFEST) {
  return JSON.parse(readFileSync(path, 'utf8')).checks;
}

export const readWorkflow = (file) => readFileSync(join(WORKFLOWS, file), 'utf8');
const readLocalAction = (name) => readFileSync(join(ROOT, '.github', 'actions', name, 'action.yml'), 'utf8');

function main() {
  const checks = loadManifest();
  const all = checks.flatMap((entry) => problems(entry, readWorkflow));
  console.log('| Check | Was | Tier | Now |\n| --- | --- | --- | --- |');
  for (const entry of checks) console.log(`| ${entry.id} | ${entry.was} | ${entry.tier} | ${entry.workflow}#${entry.job} |`);
  for (const problem of all) console.log(`::error::${problem}`);
  process.exit(all.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
