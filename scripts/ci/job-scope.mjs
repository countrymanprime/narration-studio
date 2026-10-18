// Turns an Nx affected-project list into the job-level booleans _quality.yml's `scope` job outputs.
//
//   node scripts/ci/job-scope.mjs --mode all|affected [--pins '<workflow-pins.mjs output>'] [--github-output] < affected-projects.json
//
// The mode is scripts/ci/nx-scope.sh's answer; the list is `nx show projects --affected --json`. In `all` mode every flag is true, so a
// manual run, main-health and a workspace-wide change still run every job. A flag decides whether a whole job starts, so it must never be
// false for a job whose projects are affected:
//   ui             narration-utils-ui: js-test, ui-visual, ui-atlas
//   go             narration-utils-shell: go-test (both parts together, so the coverage gate sees every package)
//   windows-quick  reaper or narration-utils-shell: quick-windows runs the Lua harness again (CRLF, package.config) and go lint
//   js-static, quick-ubuntu  true unless the change is only `uses:` pin bumps that do not reach them
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Flag -> the projects that decide it, and the jobs (as `<workflow file>#<job id>`, scripts/ci/workflow-pins.mjs) it starts.
export const JOBS = {
  ui: {
    projects: ['narration-utils-ui'],
    jobs: ['_quality.yml#js-test-shard', '_quality.yml#js-test', '_quality.yml#ui-visual-shard', '_quality.yml#ui-atlas', 'ci.yml#ci-passed'],
  },
  go: { projects: ['narration-utils-shell'], jobs: ['_quality.yml#go-test'] },
  'windows-quick': { projects: ['reaper', 'narration-utils-shell'], jobs: ['_quality.yml#quick-windows'] },
};

// These two scope their own steps (some run `always`), so they start on every change except a pure pin bump that does not reach them.
export const SELF_SCOPED = { 'js-static': '_quality.yml#js-static', 'quick-ubuntu': '_quality.yml#quick-ubuntu' };

// pins: the result of workflow-pins.mjs when kind is `pins` ({jobs, pure}), otherwise null. A pinned job starts its flag; a pure pin
// bump (nothing but `uses:` pin lines changed) leaves the self-scoped jobs out unless it reaches them.
export function jobScope(mode, affected, pins = null) {
  if (mode !== 'all' && mode !== 'affected') throw new Error(`mode must be all or affected, got ${JSON.stringify(mode)}`);
  if (!Array.isArray(affected)) throw new Error('the affected list must be a JSON array of project names');
  const pinned = new Set(pins?.jobs ?? []);
  const scope = Object.fromEntries(
    Object.entries(JOBS).map(([flag, { projects, jobs }]) => [
      flag,
      mode === 'all' || projects.some((name) => affected.includes(name)) || jobs.some((job) => pinned.has(job)),
    ]),
  );
  for (const [flag, job] of Object.entries(SELF_SCOPED)) scope[flag] = mode === 'all' || !pins?.pure || pinned.has(job);
  return scope;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const mode = argv[argv.indexOf('--mode') + 1];
  const given = argv.includes('--pins') ? JSON.parse(argv[argv.indexOf('--pins') + 1]) : null;
  const scope = jobScope(mode, JSON.parse(readFileSync(0, 'utf8') || '[]'), given?.kind === 'pins' ? given : null);
  const lines = Object.entries(scope).map(([flag, value]) => `${flag}=${value}`);
  console.log(lines.join('\n'));
  if (argv.includes('--github-output')) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }
}
