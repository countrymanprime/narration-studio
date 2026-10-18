// Which job families of _quality.yml a pin-only workflow change reaches, as the outputs of its `scope` job.
//
//   node scripts/ci/workflow-pins.mjs <base-ref> | node scripts/ci/pin-flags.mjs [--github-output]
//
// Reads workflow-pins.mjs's JSON and prints `ui`, `shell`, `winquick`, `static` and `quickubuntu` as true/false. The first three are true
// when a pinned job belongs to the family (the scope job ORs them with what Nx says is affected). `static` (js-static) and `quickubuntu`
// (quick-ubuntu) scope their own steps and start on every change, except a pure pin bump (nothing outside .github/workflows and
// .github/actions changed) that does not reach them. Anything that is not `pins` sets the first three false and the last two true.
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FAMILIES = {
  ui: ['_quality.yml#js-test-shard', '_quality.yml#js-test', '_quality.yml#ui-visual-shard', '_quality.yml#ui-atlas', 'ci.yml#ci-passed'],
  shell: ['_quality.yml#go-test'],
  winquick: ['_quality.yml#quick-windows'],
};
const SELF_SCOPED = { static: '_quality.yml#js-static', quickubuntu: '_quality.yml#quick-ubuntu' };

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
