#!/usr/bin/env node
// Checks that a project skill triggers on the prompts it should and stays quiet on near misses.
//
//   node scripts/ci/skill-evals.mjs [--skill NAME] [--dry-run] [--model ID] [--max-turns N]
//
// Each skill keeps its cases in `.claude/skills/<name>/evals/evals.json`:
//   [{ "id": "...", "prompt": "...", "expect": "trigger" | "no-trigger" }]
// A run copies `.claude/skills` into an empty scratch directory and runs `claude -p` there with only the Skill tool.
// CLAUDE.md names several skills outright, so the scratch directory has none: a trigger has to come from the skill's
// description. A case passes when the named skill was called (trigger) or was not called (no-trigger).
//
// It makes real model calls and costs money (about $0.06 each), so it is not part of
// `pnpm check`. Run it after changing a skill description, and after a model change. `--dry-run` lists the cases.
// This measures triggering only. Whether the skill then does the right thing is not checked here.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const SKILLS_DIR = join(REPO_ROOT, '.claude', 'skills');
const DEFAULT_MAX_TURNS = 2;

/** The skill names called in `claude -p --output-format stream-json` output, in order. Unparseable lines are skipped. */
export function invokedSkills(streamJson) {
  const names = [];
  for (const line of String(streamJson ?? '').split('\n')) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.type !== 'assistant') continue;
    for (const block of event.message?.content ?? []) {
      if (block?.type === 'tool_use' && block.name === 'Skill' && typeof block.input?.skill === 'string') names.push(block.input.skill);
    }
  }
  return names;
}

/** The cost reported on the final `result` event, or 0 when there is none. */
export function reportedCost(streamJson) {
  let cost = 0;
  for (const line of String(streamJson ?? '').split('\n')) {
    try {
      const event = JSON.parse(line);
      if (event?.type === 'result' && typeof event.total_cost_usd === 'number') cost = event.total_cost_usd;
    } catch {
      // not an event line
    }
  }
  return cost;
}

/** A plugin skill is called `plugin:name`, so `name` matches both spellings. */
function isSkill(called, name) {
  return called === name || called.endsWith(`:${name}`);
}

/** @returns {{ pass: boolean, reason: string }} */
export function judge({ skill, expect }, invoked) {
  const hit = invoked.some((called) => isSkill(called, skill));
  if (expect === 'trigger')
    return hit ? { pass: true, reason: 'called' } : { pass: false, reason: invoked.length ? `called ${invoked.join(', ')} instead` : 'no skill called' };
  if (expect === 'no-trigger') return hit ? { pass: false, reason: 'called, but should not have been' } : { pass: true, reason: 'not called' };
  return { pass: false, reason: `unknown expect "${expect}"` };
}

/** Validates one skill's case list. Returns the problems found, empty when it is usable. */
export function validateCases(cases) {
  if (!Array.isArray(cases) || cases.length === 0) return ['must be a non-empty array'];
  const problems = [];
  const seen = new Set();
  cases.forEach((c, index) => {
    const where = `case ${index}`;
    if (!c || typeof c.id !== 'string' || !c.id) problems.push(`${where}: id must be a non-empty string`);
    else if (seen.has(c.id)) problems.push(`${where}: duplicate id ${c.id}`);
    else seen.add(c.id);
    if (typeof c?.prompt !== 'string' || !c.prompt.trim()) problems.push(`${where}: prompt must be a non-empty string`);
    if (c?.expect !== 'trigger' && c?.expect !== 'no-trigger') problems.push(`${where}: expect must be "trigger" or "no-trigger"`);
  });
  if (!cases.some((c) => c?.expect === 'trigger')) problems.push('needs at least one "trigger" case');
  if (!cases.some((c) => c?.expect === 'no-trigger')) problems.push('needs at least one "no-trigger" case');
  return problems;
}

function loadSuites(only) {
  const suites = [];
  for (const name of readdirSync(SKILLS_DIR).sort()) {
    if (only && name !== only) continue;
    const file = join(SKILLS_DIR, name, 'evals', 'evals.json');
    if (!existsSync(file)) continue;
    const cases = JSON.parse(readFileSync(file, 'utf8'));
    const problems = validateCases(cases);
    if (problems.length) throw new Error(`${name}/evals/evals.json: ${problems.join('; ')}`);
    suites.push({ skill: name, cases });
  }
  return suites;
}

function runCase(scratch, prompt, { model, maxTurns }) {
  const args = [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--no-session-persistence',
    '--max-turns',
    String(maxTurns),
    '--allowedTools',
    'Skill',
    '--disallowedTools',
    'Bash',
    'Edit',
    'Write',
    'Read',
    'Grep',
    'Glob',
    'NotebookEdit',
  ];
  if (model) args.push('--model', model);
  const result = spawnSync('claude', args, { cwd: scratch, encoding: 'utf8', timeout: 240_000, maxBuffer: 64 * 1024 * 1024 });
  return { stdout: result.stdout ?? '', failed: result.status !== 0 };
}

function main() {
  const args = process.argv.slice(2);
  const option = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const dryRun = args.includes('--dry-run');
  const suites = loadSuites(option('--skill'));
  if (suites.length === 0) {
    console.error('skill-evals: no evals.json found' + (option('--skill') ? ` for ${option('--skill')}` : '') + '.');
    return 2;
  }
  const total = suites.reduce((sum, suite) => sum + suite.cases.length, 0);
  if (dryRun) {
    for (const { skill, cases } of suites) for (const c of cases) console.log(`${skill}  ${c.expect.padEnd(10)}  ${c.id}`);
    console.log(`skill-evals: ${total} case(s) in ${suites.length} skill(s); a real run costs roughly $${(total * 0.06).toFixed(2)}.`);
    return 0;
  }

  const scratch = mkdtempSync(join(tmpdir(), 'skill-evals-'));
  let failures = 0;
  let cost = 0;
  try {
    cpSync(SKILLS_DIR, join(scratch, '.claude', 'skills'), { recursive: true });
    for (const { skill, cases } of suites) {
      for (const c of cases) {
        const { stdout, failed } = runCase(scratch, c.prompt, { model: option('--model'), maxTurns: Number(option('--max-turns') ?? DEFAULT_MAX_TURNS) });
        cost += reportedCost(stdout);
        const outcome = failed && stdout === '' ? { pass: false, reason: 'claude failed to run' } : judge({ skill, expect: c.expect }, invokedSkills(stdout));
        if (!outcome.pass) failures++;
        console.log(`${outcome.pass ? 'PASS' : 'FAIL'}  ${skill}  ${c.expect.padEnd(10)}  ${c.id}  (${outcome.reason})`);
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log(`skill-evals: ${total - failures}/${total} passed, about $${cost.toFixed(2)} spent.`);
  return failures ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
