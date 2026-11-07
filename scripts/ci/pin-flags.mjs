// Which job families of _quality.yml a pin-only workflow change reaches, as the scope outputs of its `lint` job.
//
//   node scripts/ci/workflow-pins.mjs <base-ref> | node scripts/ci/pin-flags.mjs [--github-output]
//
// Reads workflow-pins.mjs's JSON and prints `ui`, `shell`, `static` and `quickubuntu` as true/false. The first two are true when a pinned
// job belongs to the family (the lint job ORs them with what Nx says is affected). `static` scopes the lint steps of the lint job and
// `quickubuntu` the test steps of linux-checks; both jobs start on every change. Each is true except on a pure pin bump (nothing
// outside .github/workflows and .github/actions changed) that does not reach its job. Anything that is not `pins` sets the first two false and the last two true.
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FAMILIES = {
  ui: ['_quality.yml#ui-unit', '_quality.yml#ui-visual-shard', 'ci.yml#ci-passed', 'ci.yml#ci-light-passed'],
  shell: ['_quality.yml#go-test'],
};
export const SELF_SCOPED = { static: '_quality.yml#lint', quickubuntu: '_quality.yml#linux-checks' };

export function pinFlags(pins) {
  const reached = new Set(pins?.kind === 'pins' ? pins.jobs : []);
  const flags = Object.fromEntries(Object.entries(FAMILIES).map(([name, jobs]) => [name, jobs.some((job) => reached.has(job))]));
  for (const [name, job] of Object.entries(SELF_SCOPED)) flags[name] = !(pins?.kind === 'pins' && pins.pure) || reached.has(job);
  return flags;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lines = Object.entries(pinFlags(JSON.parse(readFileSync(0, 'utf8') || '{}'))).map(([name, value]) => `${name}=${value}`);
  console.log(lines.join('\n'));
  if (process.argv.includes('--github-output')) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}
