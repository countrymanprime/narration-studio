import assert from 'node:assert/strict';
import test from 'node:test';

import { classify, HIGH_RISK_LABEL } from './pr-risk.mjs';

test('a UI-only change is normal risk', () => {
  assert.deepEqual(classify(['apps/ui/src/components/booth/Booth.tsx', 'docs/prds/x.prd.md']), { risk: 'normal', reasons: [] });
});

test('an empty change is normal risk', () => {
  assert.equal(classify([]).risk, 'normal');
});

test('each trust boundary and pipeline path makes a change high risk', () => {
  const paths = [
    '.github/workflows/ci.yml',
    '.github/actions/build-native/action.yml',
    '.claude/settings.json',
    'CLAUDE.md',
    'SECURITY.md',
    'docs/architecture/threat-model.md',
    'integrations/reaper/lua/bridge.lua',
    'apps/desktop/internal/bridge/wire.go',
    'apps/desktop/internal/update/update.go',
    'apps/desktop/internal/process/runner.go',
    'sidecars/asr/main.py',
    'scripts/release/notes.py',
    'scripts/toolchain.json',
    'pnpm-lock.yaml',
    'apps/desktop/go.sum',
    'scripts/ci/pr-risk.mjs',
  ];
  for (const path of paths) assert.equal(classify([path]).risk, 'high', path);
});

test('the reasons name the path and the boundary it touches', () => {
  const { reasons } = classify(['apps/ui/src/a.ts', '.github/workflows/ci.yml', 'sidecars/asr/main.py']);
  assert.equal(reasons.length, 2);
  assert.deepEqual(reasons[0], { path: '.github/workflows/ci.yml', boundary: 'CI and the release pipeline' });
  assert.equal(reasons[1].path, 'sidecars/asr/main.py');
});

test('backslash paths from a Windows diff are matched too', () => {
  assert.equal(classify(['.github\\workflows\\ci.yml']).risk, 'high');
});

test('the label name is the one the coordinator procedure and labels.json use', () => {
  assert.equal(HIGH_RISK_LABEL, 'risk:high');
});
