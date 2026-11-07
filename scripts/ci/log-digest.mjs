#!/usr/bin/env node
// Runs a noisy command, keeps the full output in a log file and prints a short digest, so an agent's context holds
// the failures and not thousands of passing lines.
//
// Wrapper:  node scripts/ci/log-digest.mjs [--tail N] [--out DIR] -- <command...>
//   Runs the command in a shell, writes stdout and stderr to <DIR>/<timestamp>-<slug>.log (default .runtime/log-digest)
//   and prints the digest. Exits with the command's exit code. A passing run prints its last lines; a failing run
//   prints the lines that look like failures with a little context, then the last lines.
// Claude Code PreToolUse hook:  node scripts/ci/log-digest.mjs --hook
//   Reads the hook payload on stdin. A Bash command that is one of the known noisy checks and has no shell operators is
//   rewritten to run through this wrapper. Anything else, and any command containing `# raw`, passes through unchanged.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const DEFAULT_OUT = join(REPO_ROOT, '.runtime', 'log-digest');

const DEFAULT_TAIL = 25;
const SHORT_LOG_LINES = 40;
const MAX_FAILURE_LINES = 120;
const CONTEXT_AFTER = 2;

// Lines that usually mark a failure in the tools this repo runs: Go, Vitest, Playwright, pytest, tsc, eslint, nx, pnpm.
const FAILURE_LINE =
  /(^|\s)(FAIL|FAILED|ERROR|panic:|--- FAIL)\b|✗|✘|×|\berror TS\d+|AssertionError|^E {3}|^\s*●|npm ERR!|ERR_PNPM|\bfatal:|Traceback \(most recent call last\)|\bTimeout of \d+ms|\bexpect\(|^\s+\d+ failed\b|\b\d+ failed\b/;

// Commands the hook wraps, each already allowed in .claude/settings.json or run the same way by agents: the gate, Nx,
// Vitest, tsc, ESLint and Playwright (through pnpm or npx), Go tests and vet, pytest and golangci-lint.
const NOISY_COMMANDS = [
  /^pnpm (check|test)\b/,
  /^pnpm exec nx /,
  /^pnpm (--dir \S+ )?exec (vitest|playwright test|tsc|eslint)\b/,
  /^pnpm --dir \S+ run (test|lint|typecheck|check)\S*/,
  /^npx (vitest|tsc|eslint|playwright test)\b/,
  /^go (test|vet)\b/,
  /^uv run pytest\b/,
  /^golangci-lint run\b/,
];

const SHELL_OPERATORS = /[|&;<>`\n]|\$\(/;

// Returns the digest text for a finished run.
export function digest({ text, exitCode, durationMs, logPath, tail = DEFAULT_TAIL }) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const seconds = (durationMs / 1000).toFixed(1);
  const header = `[log-digest] exit ${exitCode} · ${lines.length} lines · ${seconds}s · full log: ${logPath}`;

  if (lines.length <= SHORT_LOG_LINES) return [header, ...lines].join('\n');

  if (exitCode === 0) {
    return [header, `(passed; last ${tail} of ${lines.length} lines)`, ...lines.slice(-tail)].join('\n');
  }

  const picked = new Set();
  lines.forEach((line, index) => {
    if (!FAILURE_LINE.test(line)) return;
    for (let at = index; at <= Math.min(lines.length - 1, index + CONTEXT_AFTER); at++) picked.add(at);
  });
  const ordered = [...picked].sort((a, b) => a - b);
  const kept = ordered.slice(0, MAX_FAILURE_LINES);
  const out = [header];
  if (kept.length > 0) {
    out.push(`(failure lines: ${kept.length} of ${ordered.length} matched${ordered.length > kept.length ? ', capped' : ''})`);
    let previous = -2;
    for (const at of kept) {
      if (at !== previous + 1) out.push('…');
      out.push(lines[at]);
      previous = at;
    }
  } else {
    out.push('(no failure-looking lines matched; read the tail, or the full log if it is not enough)');
  }
  out.push(`(last ${tail} lines)`, ...lines.slice(-tail));
  return out.join('\n');
}

// Decides whether the hook wraps a Bash command, and returns the wrapped command or null. The command may start with one
// `cd <dir> &&`; the rest must be a known noisy command with no pipe, redirect or further `&&`.
export function wrapCommand(command, wrapperPath = join(HERE, 'log-digest.mjs')) {
  const trimmed = command.trim();
  if (/#\s*raw\b/.test(trimmed) || trimmed.includes('log-digest.mjs')) return null;
  const inner = trimmed.replace(/^cd \S+ && /, '');
  if (SHELL_OPERATORS.test(inner) || /[|;<>`\n]|\$\(/.test(trimmed)) return null;
  if (!NOISY_COMMANDS.some((pattern) => pattern.test(inner))) return null;
  return `node '${wrapperPath}' -- '${trimmed.replaceAll("'", "'\\''")}'`;
}

function slug(command) {
  return command
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function runWrapper(argv) {
  let tail = DEFAULT_TAIL;
  let outDir = DEFAULT_OUT;
  let index = 0;
  while (index < argv.length && argv[index] !== '--') {
    if (argv[index] === '--tail') tail = Number(argv[++index]) || DEFAULT_TAIL;
    else if (argv[index] === '--out') outDir = argv[++index];
    index++;
  }
  const command = argv.slice(index + 1).join(' ');
  if (!command) {
    process.stderr.write('usage: log-digest.mjs [--tail N] [--out DIR] -- <command...>\n');
    process.exit(64);
  }
  mkdirSync(outDir, { recursive: true });
  const logPath = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${slug(command)}.log`);
  const started = Date.now();
  const chunks = [];
  const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } });
  child.stdout.on('data', (chunk) => chunks.push(chunk));
  child.stderr.on('data', (chunk) => chunks.push(chunk));
  child.on('error', (error) => chunks.push(Buffer.from(`${error.message}\n`)));
  child.on('close', (code, signal) => {
    const text = Buffer.concat(chunks).toString('utf8');
    writeFileSync(logPath, text);
    const exitCode = code ?? (signal ? 128 : 1);
    process.stdout.write(`${digest({ text, exitCode, durationMs: Date.now() - started, logPath, tail })}\n`);
    process.exit(exitCode);
  });
}

function runHook() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const command = payload?.tool_input?.command;
  if (payload?.tool_name !== 'Bash' || typeof command !== 'string') process.exit(0);
  const wrapped = wrapCommand(command);
  if (!wrapped) process.exit(0);
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'log-digest: same command, output kept in a log file',
        updatedInput: { ...payload.tool_input, command: wrapped },
      },
    })}\n`,
  );
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args[0] === '--hook') runHook();
  else runWrapper(args);
}
