import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { digest, wrapCommand } from './log-digest.mjs';

const SCRIPT = fileURLToPath(new URL('./log-digest.mjs', import.meta.url));

const many = (count, make) => Array.from({ length: count }, (_, i) => make(i)).join('\n');

test('a short log is printed whole', () => {
  const out = digest({ text: 'a\nb\n', exitCode: 0, durationMs: 1200, logPath: '/x.log' });
  assert.match(out, /exit 0 · 2 lines · 1\.2s · full log: \/x\.log/);
  assert.match(out, /\na\nb$/);
});

test('a long passing log keeps only the tail', () => {
  const out = digest({ text: many(500, (i) => `ok ${i}`), exitCode: 0, durationMs: 0, logPath: '/x.log', tail: 5 });
  assert.match(out, /ok 499/);
  assert.doesNotMatch(out, /ok 100\b/);
  assert.equal(out.split('\n').length, 1 + 1 + 5);
});

test('a long failing log keeps failure lines with context and the tail', () => {
  const text = [many(200, (i) => `pass ${i}`), '--- FAIL: TestThing (0.00s)', '    thing_test.go:42: want 1 got 2', 'trailing detail', many(200, (i) => `pass2 ${i}`)].join('\n');
  const out = digest({ text, exitCode: 1, durationMs: 0, logPath: '/x.log', tail: 3 });
  assert.match(out, /--- FAIL: TestThing/);
  assert.match(out, /want 1 got 2/);
  assert.match(out, /trailing detail/);
  assert.doesNotMatch(out, /pass 100\b/);
  assert.match(out, /pass2 199/);
});

test('failure lines are capped', () => {
  const out = digest({ text: many(2000, (i) => `FAIL case ${i}`), exitCode: 1, durationMs: 0, logPath: '/x.log' });
  assert.match(out, /capped/);
  assert.ok(out.split('\n').length < 220);
});

test('a failing log with no recognisable failure lines says so', () => {
  const out = digest({ text: many(100, (i) => `line ${i}`), exitCode: 2, durationMs: 0, logPath: '/x.log', tail: 2 });
  assert.match(out, /no failure-looking lines matched/);
  assert.match(out, /line 99/);
});

test('wrapCommand wraps known noisy commands only', () => {
  assert.match(wrapCommand('pnpm check', '/w.mjs'), /^node '\/w\.mjs' -- pnpm check$/);
  assert.match(wrapCommand('go test ./internal/...', '/w.mjs'), /-- go test \.\/internal\/\.\.\.$/);
  assert.equal(wrapCommand('git status', '/w.mjs'), null);
  assert.equal(wrapCommand('pnpm install', '/w.mjs'), null);
});

test('wrapCommand leaves operators, opt-outs and already wrapped commands alone', () => {
  assert.equal(wrapCommand('pnpm check | tee out', '/w.mjs'), null);
  assert.equal(wrapCommand('go test ./... && go vet ./...', '/w.mjs'), null);
  assert.equal(wrapCommand('pnpm check # raw', '/w.mjs'), null);
  assert.equal(wrapCommand("node '/w/log-digest.mjs' -- pnpm check", '/w.mjs'), null);
});

test('the wrapper keeps the exit code and writes the full log', () => {
  const dir = mkdtempSync(join(tmpdir(), 'log-digest-'));
  const run = spawnSync(process.execPath, [SCRIPT, '--out', dir, '--', 'echo hello; echo boom >&2; exit 3'], { encoding: 'utf8' });
  assert.equal(run.status, 3);
  assert.match(run.stdout, /exit 3/);
  const [file] = readdirSync(dir);
  const log = readFileSync(join(dir, file), 'utf8');
  assert.match(log, /hello/);
  assert.match(log, /boom/);
});

test('the hook rewrites a noisy command and ignores the rest', () => {
  const hook = (command) =>
    spawnSync(process.execPath, [SCRIPT, '--hook'], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8' });
  const wrapped = JSON.parse(hook('pnpm check').stdout);
  assert.match(wrapped.hookSpecificOutput.updatedInput.command, /log-digest\.mjs' -- pnpm check$/);
  assert.equal(hook('ls -la').stdout, '');
});
