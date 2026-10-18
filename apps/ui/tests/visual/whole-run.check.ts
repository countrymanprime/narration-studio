import { expect, test } from '@playwright/test';
import { RUN_DIR } from './helpers/settle';
import { checkRun, readRunRecords, shardManifestProblems } from './run-checks';

// The whole-run half of the visual gate for a sharded CI run (playwright.visual-run.config.ts, `pnpm run visual:check-run`):
// each shard captured part of the catalog with its own whole-run checks deferred (UI_VISUAL_SHARDED=1), and the merge job
// puts every shard's capture records in one run directory and judges them here. No browser: it reads the records only.
test('the whole visual run: complete, no blank capture, no undeclared duplicate, no stale sameAs', () => {
  const dir = process.env.UI_VISUAL_RUN_DIR ?? RUN_DIR;
  const records = readRunRecords(dir);
  const { notes, problems: runProblems } = checkRun(records, { requireComplete: true });
  // UI_VISUAL_SHARDS is the number of shards CI split the suite into; the merge job sets it.
  const shards = process.env.UI_VISUAL_SHARDS === undefined ? undefined : Number(process.env.UI_VISUAL_SHARDS);
  const problems = [...runProblems, ...shardManifestProblems(dir, shards)];
  console.log(`${records.length} capture records`);
  for (const note of notes) console.log(note);
  expect(problems, `Visual suite validation failed:\n  ${problems.join('\n  ')}`).toEqual([]);
});
