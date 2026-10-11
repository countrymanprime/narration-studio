import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateHeartbeat, isHoldTicked, parseLastPass, tickHold } from './train-health.mjs';

const HOUR = 60 * 60 * 1000;
const now = new Date('2026-10-10T12:00:00Z');
const bodyAt = (stamp, hold = ' ') => `## Train control\n\nLast pass: ${stamp}\n\n### Switches\n\n- [${hold}] HOLD\n- [ ] DRAIN\n`;

test('parseLastPass reads the ISO timestamp on the Last pass line', () => {
  assert.equal(parseLastPass(bodyAt('2026-10-10T11:30:00Z'))?.toISOString(), '2026-10-10T11:30:00.000Z');
});

test('parseLastPass ignores a body with no Last pass line or an unreadable date', () => {
  assert.equal(parseLastPass('## Train control\n\nLast rewritten 2026-09-27 20:42 UTC.'), undefined);
  assert.equal(parseLastPass('Last pass: yesterday-ish'), undefined);
});

test('isHoldTicked sees a ticked HOLD and not DRAIN', () => {
  assert.equal(isHoldTicked(bodyAt('2026-10-10T11:30:00Z', 'x')), true);
  assert.equal(isHoldTicked('- [ ] HOLD\n- [x] DRAIN\n'), false);
  assert.equal(isHoldTicked('- [x] HOLD-UNTIL-RESET\n'), false);
});

test('evaluateHeartbeat: a recent pass is healthy', () => {
  assert.equal(evaluateHeartbeat({ body: bodyAt('2026-10-10T11:00:00Z'), now, staleAfterMs: 2 * HOUR }).stale, false);
});

test('evaluateHeartbeat: a pass older than the threshold is stale and says how long', () => {
  const result = evaluateHeartbeat({ body: bodyAt('2026-10-10T08:00:00Z'), now, staleAfterMs: 2 * HOUR });
  assert.equal(result.stale, true);
  assert.equal(result.lastPass.toISOString(), '2026-10-10T08:00:00.000Z');
  assert.match(result.reason, /4 h/);
});

test('evaluateHeartbeat: no Last pass line is stale, because the coordinator has never reported one', () => {
  const result = evaluateHeartbeat({ body: '## Train control\n', now, staleAfterMs: 2 * HOUR });
  assert.equal(result.stale, true);
  assert.match(result.reason, /no Last pass/);
});

test('evaluateHeartbeat: an owner HOLD is not a stall', () => {
  const result = evaluateHeartbeat({ body: bodyAt('2026-10-01T00:00:00Z', 'x'), now, staleAfterMs: 2 * HOUR });
  assert.equal(result.stale, false);
  assert.match(result.reason, /HOLD/);
});

test('tickHold ticks the HOLD box and nothing else', () => {
  const ticked = tickHold(bodyAt('2026-10-10T11:00:00Z'));
  assert.match(ticked, /- \[x\] HOLD\n- \[ \] DRAIN/);
});

test('tickHold leaves an already ticked body unchanged and does not touch HOLD-UNTIL-RESET', () => {
  const already = bodyAt('2026-10-10T11:00:00Z', 'x');
  assert.equal(tickHold(already), already);
  const other = '- [ ] HOLD-UNTIL-RESET\n';
  assert.equal(tickHold(other), other);
});
