#!/usr/bin/env node
// Looks for filler phrases in the prose of changed Markdown (issue #943; skills docs-style and doc-unslop hold the
// rules this enforces). `docs-slop-phrases.json` lists the phrases. An `error` phrase has near-zero legitimate use in
// technical writing and fails the run; a `warn` phrase is printed and never fails. Code, link targets, quotations,
// comments, front matter and the files in the list's `ignore` are skipped.
//
//   node scripts/ci/docs-slop.mjs [--base REF] [--all] [--summary]
//
// --base REF  compare against REF instead of origin/main (or $GITHUB_BASE_REF in CI)
// --all       scan every tracked Markdown file, to measure the list against the whole tree
// --summary   append the findings to $GITHUB_STEP_SUMMARY when it is set (CI)
//
// A phrase list is a smell detector, not a verdict: it cannot judge a sentence, and models change what they overuse.
// The doc-unslop skill does the judgment; this keeps the plainest filler out of a merge.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { changedMarkdownFiles } from './changed-markdown.mjs';
import { globToRegExp } from './docs-impact.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const CONFIG_FILE = join(HERE, 'docs-slop-phrases.json');

const FENCE = /^\s*(```+|~~~+)/;

export function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
}

export function isIgnored(file, ignoreGlobs) {
  return ignoreGlobs.some((glob) => globToRegExp(glob).test(file));
}

/** Blanks what a reader does not read as prose: comments, inline code, link targets and bare URLs. */
function blankNonProse(line) {
  return line
    .replace(/<!--[\s\S]*?--!?>/g, ' ')
    .replace(/(`+)[^`]*?\1/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/<https?:[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
}

/** The prose lines of a Markdown file with their 1-based line numbers: fences, front matter and quotations are left out. */
export function proseLines(text) {
  const lines = text.split(/\r?\n/);
  const prose = [];
  let index = 0;
  if (lines[0]?.trim() === '---') {
    const close = lines.indexOf('---', 1);
    if (close !== -1) index = close + 1;
  }
  let fence = null;
  let inComment = false; // inside a multi-line HTML comment
  for (; index < lines.length; index++) {
    const line = lines[index];
    const opening = FENCE.exec(line);
    if (fence) {
      if (opening && opening[1][0] === fence[0] && opening[1].length >= fence.length) fence = null;
      continue;
    }
    if (opening) {
      fence = opening[1];
      continue;
    }
    if (/^\s*>(?!\s*\[!)/.test(line)) continue; // a quotation; a GitHub alert (`> [!NOTE]`) is still the doc's own prose
    if (inComment) {
      if (line.includes('-->')) inComment = false;
      continue;
    }
    if (/<!--(?!.*-->)/.test(line)) inComment = true;
    prose.push({ number: index + 1, text: blankNonProse(line) });
  }
  return prose;
}

/** One hit per phrase per line. */
export function findSlop(text, phrases) {
  const compiled = phrases.map((phrase) => ({ ...phrase, regexp: new RegExp(phrase.pattern, 'i') }));
  const hits = [];
  for (const { number, text: line } of proseLines(text)) {
    for (const { id, level, reason, regexp } of compiled) {
      const found = regexp.exec(line);
      if (found) hits.push({ line: number, id, level, match: found[0].trim(), reason });
    }
  }
  return hits;
}

function trackedMarkdown() {
  return execFileSync('git', ['ls-files', '-z', '*.md'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const baseFlag = args.indexOf('--base');
  const base = baseFlag !== -1 ? args[baseFlag + 1] : process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';
  const { phrases, ignore } = loadConfig();
  const all = args.includes('--all');
  const files = (all ? trackedMarkdown() : changedMarkdownFiles({ base, cwd: REPO_ROOT, includeWorkingTree: true })).filter((file) => !isIgnored(file, ignore));

  const report = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(join(REPO_ROOT, file), 'utf8');
    } catch {
      continue; // listed but absent from the working tree
    }
    for (const hit of findSlop(text, phrases)) report.push({ file, ...hit });
  }

  const errors = report.filter((hit) => hit.level === 'error');
  const lines = report.map((hit) => `${hit.file}:${hit.line} ${hit.level} ${hit.id} "${hit.match}": ${hit.reason}`);
  for (const line of lines) console.log(line);
  console.log(`docs-slop: ${files.length} file(s), ${errors.length} error(s), ${report.length - errors.length} warning(s).`);

  if (args.includes('--summary') && process.env.GITHUB_STEP_SUMMARY && report.length > 0) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Docs prose\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
  }
  if (errors.length > 0) {
    console.error('Cut the filler or say the checkable fact (see the doc-unslop skill). Do not weaken the phrase list to pass.');
    return 1;
  }
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main());
