#!/usr/bin/env node
// Rates a pull request's risk from the paths it changes, so the agent train never merges a trust-boundary change on its own.
//
// node scripts/ci/pr-risk.mjs <path>...   Prints `high` or `normal`, then one `path: boundary` line per reason.
// node scripts/ci/pr-risk.mjs --json      Same, as JSON, reading the changed paths from stdin (one per line).
//
// The `PR risk` workflow puts the `risk:high` label on a pull request that rates high. The coordinator does not
// merge one until the owner approves it on #510 (docs/operations/agent-train.md, "Safety net"). The boundaries are
// the ones CLAUDE.md names and docs/architecture/threat-model.md tracks, plus the files that decide what runs
// unattended: the workflows, the agent config and the scripts in this safety net itself.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const HIGH_RISK_LABEL = 'risk:high';

const BOUNDARIES = [
  [/^\.github\/(workflows|actions)\//, 'CI and the release pipeline'],
  [/^scripts\/(release|licenses)\//, 'CI and the release pipeline'],
  [/^scripts\/ci\/(pr-risk|test-ratchet|train-health|gate-stamp)\./, 'the unattended safety net'],
  [/^(\.claude\/|CLAUDE\.md$)/, 'agent configuration'],
  [/^(SECURITY\.md$|docs\/architecture\/threat-model\.md$)/, 'the security policy and threat model'],
  [/^integrations\/reaper\//, 'the REAPER bridge'],
  [/^apps\/desktop\/internal\/bridge\//, 'the REAPER bridge'],
  [/^apps\/desktop\/internal\/(update|process|assets|ffmpeg|credentialstore)\//, 'downloads, the update, sidecar launch and stored credentials'],
  [/^sidecars\//, 'sidecar arguments and output'],
  [/^(scripts\/toolchain\.json|pnpm-lock\.yaml|apps\/desktop\/go\.sum|uv\.lock|libs\/python\/uv\.lock)$/, 'pinned toolchain and dependencies'],
];

/** Rates the changed paths. `reasons` lists each path that touches a boundary, once, in the order given. */
export function classify(paths) {
  const reasons = [];
  for (const raw of paths) {
    const path = raw.replaceAll('\\', '/');
    const hit = BOUNDARIES.find(([pattern]) => pattern.test(path));
    if (hit) reasons.push({ path, boundary: hit[1] });
  }
  return { risk: reasons.length ? 'high' : 'normal', reasons };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const asJson = args[0] === '--json';
  const paths = asJson ? readFileSync(0, 'utf8').split('\n').filter(Boolean) : args;
  const result = classify(paths);
  if (asJson) console.log(JSON.stringify(result));
  else {
    console.log(result.risk);
    for (const { path, boundary } of result.reasons) console.log(`${path}: ${boundary}`);
  }
}
