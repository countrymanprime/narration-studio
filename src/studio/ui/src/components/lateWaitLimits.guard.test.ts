import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEAVE_STOP_WAIT_MS } from './booth/leave/useBoothLeaveGuard';
import { PRESS_LIMITS_MS } from './booth/record/pressLimits';
import { ASK_DEADLINE_MS as ADD_MARKER_MS } from './engine/AddMarkers';
import { ASK_DEADLINE_MS as SHOW_IN_DAW_MS } from './engine/ShowInDaw';

// #3752: the host waits LateAnswerWait past DefaultAnswerTimeout for a command the DAW has taken that changes it. A page-side limit on such a
// call that is shorter says the DAW did not answer and frees the control before the command lands (qa-breaker: Proof's marker and Show in, a leave
// during a pending Stop). Each page-side limit on a call that sends one write is listed here and must outlast the host, read from the Go source.
// A new limit on a DAW write goes in this list.
const GO = join(__dirname, '../../../desktop/internal/bridge');
const seconds = (file: string, name: string): number => {
  const match = readFileSync(join(GO, file), 'utf8').match(new RegExp(`\\b${name}\\s*=\\s*(\\d+)\\s*\\*\\s*time\\.Second`));
  expect(match, `${name} is not in ${file} as N * time.Second: update this test`).not.toBeNull();
  return Number(match![1]) * 1000;
};

describe('a page-side limit on a DAW write outlasts the host wait for a command the DAW has taken', () => {
  const hostWait = () => seconds('navigation.go', 'DefaultAnswerTimeout') + seconds('actions.go', 'LateAnswerWait');
  for (const [name, ms] of [
    ['Show in the DAW (ShowInDaw.tsx ASK_DEADLINE_MS)', SHOW_IN_DAW_MS],
    ['Add marker (AddMarkers.tsx ASK_DEADLINE_MS)', ADD_MARKER_MS],
    ["the Booth's Stop (PRESS_LIMITS_MS.recordStop)", PRESS_LIMITS_MS.recordStop],
    ['leaving the Booth during a take (LEAVE_STOP_WAIT_MS)', LEAVE_STOP_WAIT_MS],
  ] as const) {
    it(name, () => expect(ms).toBeGreaterThan(hostWait()));
  }
});
