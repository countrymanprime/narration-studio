// Checks the `slice-meta` header of a Studio Next slice issue, so the coordinator can compute collisions without opening code.
// The spec is .claude/skills/agent-train/references/studio-next-delivery.md ("The slice issue"); this comment is the one home of the header's keys.
//
//   node scripts/dev/slice-lint.mjs <file | ->                paste an issue body (or just the block) into a file, or pipe it
//   node scripts/dev/slice-lint.mjs body.md --issue 1002      also check the cycle through the issues this one depends on
//   node scripts/dev/slice-lint.mjs body.md --offline         skip the GitHub lookups (existence, cross-issue cycles)
//
// The header is a fenced block tagged `slice-meta` holding a small YAML subset (scalars, `[a, b]` lists, `- item` lists):
//
//   id: SN-A1                       SN-<code><n>: the PRD code in capitals, then the slice number
//   lane: D                         one of K A B U C D X (.claude/skills/agent-train/SKILL.md, "Lanes")
//   kind: docs                      one of spike adr seam page swap host lua docs
//   depends: [996]                  issue numbers (`996` or `#996`) that must be merged first; `[]` for none
//   owns:                           globs this slice may touch; at least one
//     - apps/ui/src/pages/Tracks/**
//     - "new:scripts/dev/x.mjs"     `new:` marks a file the slice creates: it is exempt from the match check only
//   serial:                         serial points used (`hostAPIVersion`, `nav`, `.github`, ...); `[]` for none
//
// Every key is required. A glob that is not `new:` must match at least one tracked file (`git ls-files`). Globs are repo-relative:
// `**` crosses directories, `*` and `?` stay inside one, `[abc]` is a class, `{a,b}` an alternation. Tested by scripts/ci/slice-lint.test.mjs.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LANES = ['K', 'A', 'B', 'U', 'C', 'D', 'X'];
export const KINDS = ['spike', 'adr', 'seam', 'page', 'swap', 'host', 'lua', 'docs'];
const REQUIRED = ['id', 'lane', 'kind', 'depends', 'owns', 'serial'];
const LIST_KEYS = new Set(['depends', 'owns', 'serial']);
const NEW_PREFIX = 'new:';

/** The text of the first fenced `slice-meta` block, or the whole input when it has none (a pasted bare block). */
export function extractMeta(text) {
  const fenced = /^```slice-meta[ \t]*\r?\n([\s\S]*?)^```/m.exec(text);
  return (fenced ? fenced[1] : text).trimEnd();
}

function unquote(raw) {
  const value = raw.trim();
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value.replace(/\s+#.*$/, '');
}

function issueNumber(raw) {
  const match = /^#?(\d+)$/.exec(String(raw));
  if (!match) throw new Error(`depends: "${raw}" is not an issue number`);
  return Number(match[1]);
}

/** Parses the YAML subset above. Throws `line N: ...` on anything else. */
export function parseMeta(block) {
  const meta = {};
  let list = null;
  block.split(/\r?\n/).forEach((line, index) => {
    const at = `line ${index + 1}`;
    if (!line.trim() || line.trim().startsWith('#')) return;
    const item = /^\s+-\s*(.*)$/.exec(line);
    if (item) {
      if (!list) throw new Error(`${at}: a list item outside a list key`);
      list.push(unquote(item[1]));
      return;
    }
    const pair = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!pair) throw new Error(`${at}: expected "key: value"`);
    const [, key, rest] = pair;
    if (key in meta) throw new Error(`${at}: duplicate key "${key}"`);
    list = null;
    const value = rest.trim();
    if (LIST_KEYS.has(key) && (value === '' || value.startsWith('['))) {
      list = [];
      if (value) {
        if (!value.endsWith(']')) throw new Error(`${at}: unterminated [ list`);
        const inner = value.slice(1, -1).trim();
        if (inner) list.push(...inner.split(',').map(unquote));
      }
      meta[key] = list;
      if (value) list = null;
    } else {
      if (LIST_KEYS.has(key)) throw new Error(`${at}: "${key}" must be a list`);
      meta[key] = unquote(value);
    }
  });
  if (meta.depends) meta.depends = meta.depends.map(issueNumber);
  return meta;
}

/** Translates an owns glob to an anchored RegExp. */
export function globToRegExp(glob) {
  let out = '';
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/';
      out += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '[') {
      const close = glob.indexOf(']', i + 2);
      out += glob.slice(i, close + 1).replace(/^\[!/, '[^');
      i = close;
    } else if (c === '{') {
      braces++;
      out += '(?:';
    } else if (c === '}' && braces > 0) {
      braces--;
      out += ')';
    } else if (c === ',' && braces > 0) out += '|';
    else out += c.replace(/[.+^$()|\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** Why a glob is unusable, or null. */
function globProblem(glob) {
  if (/^\//.test(glob) || /^[A-Za-z]:/.test(glob)) return 'must be repo-relative';
  if (glob.split('/').includes('..')) return 'must not contain ".."';
  if (glob.startsWith('!')) return 'negation is not supported';
  if (glob.includes('\\')) return 'use "/" separators, not "\\"';
  if (/\s$|^\s/.test(glob)) return 'has leading or trailing space';
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] === '[') {
      const close = glob.indexOf(']', i + 2);
      if (close < 0) return 'has an unclosed "["';
      i = close;
    } else if (glob[i] === '{') depth++;
    else if (glob[i] === '}' && --depth < 0) return 'has an unmatched "}"';
  }
  return depth > 0 ? 'has an unclosed "{"' : null;
}

/** The first cycle in `{issue: [issues it depends on]}` as a path that ends where it starts, or null. */
export function findCycle(graph) {
  const edges = new Map(Object.entries(graph).map(([k, v]) => [Number(k), v.map(Number)]));
  const done = new Set();
  const path = [];
  const visit = (node) => {
    const at = path.indexOf(node);
    if (at >= 0) return [...path.slice(at), node];
    if (done.has(node)) return null;
    path.push(node);
    for (const next of edges.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    path.pop();
    done.add(node);
    return null;
  };
  for (const node of [...edges.keys()].sort((a, b) => a - b)) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Lints a slice body or bare block and returns the error messages (empty when valid).
 * `files` are the tracked paths, `issueExists(n)` the optional existence check (skipped when absent),
 * `issue` this slice's own number and `graph` the depends of the other issues, for the cycle check.
 */
export function lintSlice(text, { files, issueExists, issue, graph = {} }) {
  let meta;
  try {
    meta = parseMeta(extractMeta(text));
  } catch (error) {
    return [error.message];
  }
  const errors = [];
  for (const key of REQUIRED) if (meta[key] === undefined || meta[key] === '') errors.push(`missing required key "${key}"`);
  for (const key of Object.keys(meta)) if (!REQUIRED.includes(key)) errors.push(`unknown key "${key}"`);
  if (meta.id && !/^SN-[A-Z]+\d+$/.test(meta.id)) errors.push(`id "${meta.id}" is not SN-<code><n> (for example SN-F2)`);
  if (meta.lane && !LANES.includes(meta.lane)) errors.push(`unknown lane "${meta.lane}" (one of ${LANES.join(' ')})`);
  if (meta.kind && !KINDS.includes(meta.kind)) errors.push(`unknown kind "${meta.kind}" (one of ${KINDS.join(' ')})`);
  if (meta.owns?.length === 0) errors.push('owns must list at least one glob');
  for (const entry of meta.owns ?? []) {
    const isNew = entry.startsWith(NEW_PREFIX);
    const glob = isNew ? entry.slice(NEW_PREFIX.length) : entry;
    const problem = glob ? globProblem(glob) : 'owns entry is empty';
    if (problem) errors.push(glob ? `owns: invalid glob "${entry}": ${problem}` : problem);
    else if (!isNew && !files.some((file) => globToRegExp(glob).test(file))) {
      errors.push(`owns: "${glob}" matches no tracked file (prefix it with "${NEW_PREFIX}" if the slice creates it)`);
    }
  }
  if (issueExists) {
    for (const n of meta.depends ?? []) if (!issueExists(n)) errors.push(`depends: issue #${n} does not exist`);
  }
  const full = issue === undefined ? graph : { ...graph, [issue]: meta.depends ?? [] };
  const cycle = findCycle(full);
  if (cycle) errors.push(`cyclic depends: ${cycle.map((n) => `#${n}`).join(' -> ')}`);
  return errors;
}

// ---- command line: the only part that talks to git and GitHub ----

const ghIssue = (number) => {
  try {
    return JSON.parse(execFileSync('gh', ['api', `repos/{owner}/{repo}/issues/${number}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('the gh CLI is not installed; pass --offline to skip the GitHub lookups');
    return null;
  }
};

/** Follows `depends` through the issues' own headers, to find a cycle that runs through another issue. */
function loadGraph(start, lookup) {
  const graph = {};
  const queue = [...start];
  while (queue.length) {
    const n = queue.shift();
    if (n in graph) continue;
    const body = lookup(n)?.body ?? '';
    let depends = [];
    try {
      depends = parseMeta(extractMeta(/```slice-meta/.test(body) ? body : '')).depends ?? [];
    } catch {
      // another issue's malformed header is its own lint run's problem
    }
    graph[n] = depends;
    queue.push(...depends);
  }
  return graph;
}

function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const flag = (name) => argv.indexOf(`--${name}`);
  const offline = flag('offline') >= 0;
  const issue = flag('issue') >= 0 ? Number(argv[flag('issue') + 1]) : undefined;
  if (args.length === 0 || (issue !== undefined && !Number.isInteger(issue))) {
    console.error('usage: slice-lint.mjs <file | -> [--issue <n>] [--offline]');
    return 2;
  }
  const text = readFileSync(args[0] === '-' ? 0 : args[0], 'utf8');
  const files = spawnSync('git', ['ls-files'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  const cache = new Map();
  const lookup = (n) => (cache.has(n) ? cache.get(n) : cache.set(n, ghIssue(n)).get(n));
  const options = { files, issue };
  if (!offline) {
    options.issueExists = (n) => lookup(n) !== null;
    try {
      options.graph = loadGraph(parseMeta(extractMeta(text)).depends ?? [], lookup);
    } catch (error) {
      if (!/gh CLI/.test(error.message)) options.graph = {};
      else {
        console.error(error.message);
        return 2;
      }
    }
  }
  const errors = lintSlice(text, options);
  for (const error of errors) console.error(`slice-lint: ${error}`);
  if (errors.length === 0) console.log('slice-lint: ok');
  return errors.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
