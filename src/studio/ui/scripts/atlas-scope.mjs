#!/usr/bin/env node
/* global console, process */
// The atlas step of CI (_quality.yml, Test (Linux)): on a pull request it runs only the stories the change reaches, and every
// other run (Main health on `main`, a manual run, `pnpm atlas`) runs all of them (docs/research/test-speed-plan-2026-11.md, M3).
// So a story left off a pull request runs on `main` after the merge, where a red run ticks HOLD on the train issue.
//
// A story is reached when its story file imports a changed file, directly or through other modules (the import graph of
// dependency-cruiser, type-only imports included). A changed file the graph does not hold reaches nothing when Storybook cannot
// read it (a doc, a Go, Python or Lua project, the visual and aria suites, a contract fixture). The answer is every story, the strict direction, when
// a changed file
//   - is any other file the graph does not hold (a deleted module, a stylesheet only another stylesheet imports, an asset, a
//     config, a lockfile, the atlas spec, a workflow, a script);
//   - reaches .storybook/, which every story loads (styles.css, the theme, the fonts).
// shortcut: the stylesheet is built from the class names Tailwind finds in every file under src/studio/ui, so a class name added or
// removed in a file that reaches no story changes the CSS of a story that builds the same name at run time; main draws it. Upgrade
// by treating a changed class name as reaching every story if that is ever seen.
// A pull request that reaches no story builds no Storybook and starts no browser.
//
// Usage: node scripts/atlas-scope.mjs [playwright arguments, e.g. --shard=1/6]   (from src/studio/ui)
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';

import { changedFiles } from '../../../../scripts/ci/pr-scope.mjs';

const UI = 'src/studio/ui';
// What Storybook cannot read unless a module imports it (then the graph holds it): docs, the other toolchains' projects, and the
// suites that drive the app and not a story, and the contract fixtures (a story that imports one is in the graph).
const NOT_A_STORY_INPUT = /^(docs\/|src\/studio\/(desktop|sidecars|libs|integrations)\/|src\/studio\/ui\/tests\/(visual|aria)\/|tests\/fixtures\/)|\.md$/;
const isStory = (source) => /\.stories\.[cm]?[jt]sx?$/.test(source);

/**
 * The story files a change reaches. `changed` is the pull request's files from the repository root (pr-scope.mjs) or null;
 * `modules` is dependency-cruiser's list for `src .storybook`, with sources relative to src/studio/ui.
 * Returns { everything: true, reason } or { everything: false, stories: [source, ...] }.
 */
export function scopeOf(changed, modules) {
  if (changed === null) return { everything: true, reason: 'not a pull request, or its base cannot be read' };
  const importers = new Map();
  for (const module of modules) {
    if (!importers.has(module.source)) importers.set(module.source, []);
    for (const dependency of module.dependencies ?? []) {
      if (!importers.has(dependency.resolved)) importers.set(dependency.resolved, []);
      importers.get(dependency.resolved).push(module.source);
    }
  }
  const reached = new Set();
  for (const file of changed) {
    const source = posix.relative(UI, file);
    if (!importers.has(source)) {
      if (NOT_A_STORY_INPUT.test(file)) continue;
      return { everything: true, reason: `${file} is not a module of the import graph` };
    }
    const queue = [source];
    while (queue.length > 0) {
      const next = queue.pop();
      if (reached.has(next)) continue;
      reached.add(next);
      if (next.startsWith('.storybook/')) return { everything: true, reason: `${file} reaches ${next}, which every story loads` };
      queue.push(...importers.get(next));
    }
  }
  return { everything: false, stories: [...reached].filter(isStory).sort() };
}

/** One line for the log and the job summary. */
export function describeScope(scope) {
  if (scope.everything) return `atlas scope: every story (${scope.reason})`;
  if (scope.stories.length === 0) return 'atlas scope: the change reaches no story; every story runs on main after the merge.';
  return `atlas scope: ${scope.stories.length} story files the change reaches (${scope.stories.join(', ')}); the other stories run on main after the merge.`;
}

function importGraph() {
  const run = spawnSync('pnpm', ['exec', 'depcruise', 'src', '.storybook', '--config', '.dependency-cruiser.mjs', '--no-progress', '--output-type', 'json'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  // The architecture step judges the import rules (exit code = violations); this only reads the graph.
  return JSON.parse(run.stdout).modules;
}

function main(args) {
  const changed = changedFiles();
  let scope;
  try {
    scope = changed === null ? scopeOf(null, []) : scopeOf(changed, importGraph());
  } catch (error) {
    scope = { everything: true, reason: `the import graph could not be read: ${error.message}` };
  }
  const said = describeScope(scope);
  console.log(said);
  // Shard 1 alone writes the line into the run's summary; every shard computes the same scope.
  if (process.env.GITHUB_STEP_SUMMARY && args.some((arg) => /^--shard=1\//.test(arg))) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${said}\n`);
  if (!scope.everything && scope.stories.length === 0) return 0;
  const narrowed = scope.everything
    ? { args, env: process.env }
    : // A shard can draw none of a short list. index.json names a story file as `./src/...`.
      { args: [...args, '--pass-with-no-tests'], env: { ...process.env, UI_ATLAS_STORY_FILES: scope.stories.map((source) => `./${source}`).join(',') } };
  return spawnSync('pnpm', ['run', 'atlas', ...narrowed.args], { stdio: 'inherit', env: narrowed.env }).status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
