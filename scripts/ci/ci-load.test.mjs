import assert from 'node:assert/strict';
import test from 'node:test';

import { billedMinutes, heldRunner, latestRuns, load, peakOverlap, render, runnerOs } from './ci-load.mjs';

const job = (name, start, end, extra = {}) => ({
  name,
  labels: ['ubuntu-latest'],
  conclusion: 'success',
  created_at: `2026-11-06T10:${start}Z`,
  started_at: `2026-11-06T10:${start}Z`,
  completed_at: `2026-11-06T10:${end}Z`,
  run_attempt: 1,
  ...extra,
});

test('a skipped job holds no runner, even though GitHub gives it a start and an end', () => {
  assert.equal(heldRunner(job('skip', '00:00', '00:00', { conclusion: 'skipped' })), false);
  assert.equal(heldRunner(job('zero', '00:00', '00:00')), false);
  assert.equal(heldRunner({ name: 'queued', started_at: null, completed_at: null }), false);
  assert.equal(heldRunner(job('ran', '00:00', '01:30')), true);
});

test('the runner OS comes from the labels', () => {
  assert.equal(runnerOs(job('w', '00:00', '01:00', { labels: ['windows-latest'] })), 'windows');
  assert.equal(runnerOs(job('l', '00:00', '01:00')), 'linux');
  assert.equal(runnerOs({}), 'linux');
});

test('peak overlap counts open intervals, and a job that ends as another starts is not overlapping', () => {
  assert.equal(peakOverlap([]), 0);
  assert.equal(peakOverlap([[0, 10], [10, 20]]), 1);
  assert.equal(peakOverlap([[0, 10], [5, 20], [6, 7], [15, 30]]), 3);
  assert.equal(peakOverlap([[5, 5]]), 0);
});

test('billed minutes round each job up to a whole minute', () => {
  assert.equal(billedMinutes([job('a', '00:00', '00:10'), job('b', '00:00', '02:01'), job('c', '00:00', '00:00', { conclusion: 'skipped' })]), 1 + 3);
});

test('only the newest run of a workflow and each job\'s latest attempt count', () => {
  const runs = [
    { name: 'CI', created_at: '2026-11-06T09:00:00Z', run_attempt: 1, jobs: [job('old push', '00:00', '05:00')] },
    {
      name: 'CI',
      created_at: '2026-11-06T10:00:00Z',
      run_attempt: 2,
      jobs: [
        job('re-run', '00:00', '05:00', { run_attempt: 1 }),
        job('re-run', '06:00', '09:00', { run_attempt: 2 }),
        job('not repeated', '00:00', '01:00', { run_attempt: 1 }),
      ],
    },
    { name: 'Docs', created_at: '2026-11-06T10:00:00Z', run_attempt: 1, jobs: [job('docs', '00:00', '00:30')] },
  ];
  const latest = latestRuns(runs);
  assert.deepEqual(latest.map((run) => run.jobs.map((j) => `${j.name}@${j.run_attempt}`)), [['re-run@2', 'not repeated@1'], ['docs@1']]);
});

test('a full-tier row counts checks, runners, the peak, minutes per OS and the CI wall clock', () => {
  const runs = [
    {
      name: 'CI',
      created_at: '2026-11-06T10:00:00Z',
      run_attempt: 1,
      jobs: [
        job('quality / scope', '00:00', '00:40'),
        job('quality / go-test (root)', '01:00', '12:00', { labels: ['windows-latest'] }),
        job('quality / ui-visual (shard 1/4)', '01:00', '20:00'),
        job('CI light passed', '20:10', '20:10', { conclusion: 'skipped' }),
        job('CI passed', '20:10', '20:40'),
      ],
    },
    { name: 'Docs', created_at: '2026-11-06T10:00:00Z', run_attempt: 1, jobs: [job('Docs checks', '00:00', '00:50')] },
  ];
  assert.deepEqual(load(runs), {
    workflows: 2,
    checks: 6,
    ran: 5,
    ranWindows: 1,
    peakRunning: 2,
    peakDemand: 2,
    minutesLinux: 1 + 19 + 1 + 1,
    minutesWindows: 11,
    ciTier: 'full',
    ciWallMinutes: 20.7,
  });
});

test('queued time counts toward demand, not toward running', () => {
  const runs = [
    {
      name: 'CI',
      created_at: '2026-11-06T10:00:00Z',
      run_attempt: 1,
      jobs: [job('a', '00:00', '10:00'), job('b', '09:00', '12:00', { created_at: '2026-11-06T10:01:00Z' }), job('CI light passed', '12:00', '12:10')],
    },
  ];
  const row = load(runs);
  assert.equal(row.peakRunning, 2);
  assert.equal(row.peakDemand, 2);
  assert.equal(row.ciTier, 'light');
});

test('the table ends with the medians of the full-tier rows', () => {
  const rows = [
    { label: '#1', ciTier: 'full', workflows: 7, checks: 28, ran: 23, ranWindows: 4, peakRunning: 14, peakDemand: 14, minutesLinux: 130, minutesWindows: 40, ciWallMinutes: 26 },
    { label: '#2', ciTier: 'light', workflows: 5, checks: 12, ran: 10, ranWindows: 3, peakRunning: 9, peakDemand: 9, minutesLinux: 30, minutesWindows: 40, ciWallMinutes: 15 },
  ];
  const lines = render(rows).split('\n');
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^\| label \| ciTier \|/);
  assert.equal(lines[4], '| median of 1 full | full | 7 | 28 | 23 | 4 | 14 | 14 | 130 | 40 | 26 |');
});
