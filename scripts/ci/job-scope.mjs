// Turns an Nx affected-project list into the job-level booleans _quality.yml's `scope` job outputs.
//
//   node scripts/ci/job-scope.mjs --mode all|affected [--github-output] < affected-projects.json
//
// The mode is scripts/ci/nx-scope.sh's answer; the list is `nx show projects --affected --json`. In `all` mode every flag is true, so a
// manual run, main-health and a workspace-wide change still run every job. A flag decides whether a whole job starts, so it must never be
// false for a job whose projects are affected:
//   ui             narration-utils-ui: js-test, ui-visual, ui-atlas
//   go             narration-utils-shell: go-test (both parts together, so the coverage gate sees every package)
//   windows-quick  reaper or narration-utils-shell: quick-windows runs the Lua harness again (CRLF, package.config) and go lint
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const JOBS = {
  ui: ['narration-utils-ui'],
  go: ['narration-utils-shell'],
  'windows-quick': ['reaper', 'narration-utils-shell'],
};

export function jobScope(mode, affected) {
  if (mode !== 'all' && mode !== 'affected') throw new Error(`mode must be all or affected, got ${JSON.stringify(mode)}`);
  if (!Array.isArray(affected)) throw new Error('the affected list must be a JSON array of project names');
  return Object.fromEntries(Object.entries(JOBS).map(([flag, projects]) => [flag, mode === 'all' || projects.some((name) => affected.includes(name))]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const mode = argv[argv.indexOf('--mode') + 1];
  const scope = jobScope(mode, JSON.parse(readFileSync(0, 'utf8') || '[]'));
  const lines = Object.entries(scope).map(([flag, value]) => `${flag}=${value}`);
  console.log(lines.join('\n'));
  if (argv.includes('--github-output')) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  }
}
