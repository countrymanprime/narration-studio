#!/usr/bin/env node
// Lints the agent train's owner board before the coordinator saves it
// (.claude/skills/agent-train/references/coordinator.md, "The owner board").
//
// node scripts/ci/board-lint.mjs <board.json>      Reads a board export; exits 1 and prints each broken row.
//
// The export is JSON: { "rows": [{ "id", "section", "ask"?, "question"?, "session"?, "pr"? }], "live"?: { "sessions": [], "prs": [] } }.
// `section` is one of waiting, queued, building, merged, blocked. `live` lists the session ids and open PR numbers
// the coordinator just read; when present, a building row must name one of them.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const filled = (value) => typeof value === 'string' ? value.trim() !== '' : value != null && value !== false;

/** The problems in a board export, one string per broken row. An empty list means the board may be saved. */
export function lintBoard(board) {
  const problems = [];
  const live = board?.live;
  for (const row of board?.rows ?? []) {
    const asks = filled(row.ask) || filled(row.question);
    if (asks && row.section !== 'waiting') {
      problems.push(`${row.id}: has an ask or question but sits in ${row.section}; move it to waiting`);
    }
    if (row.section === 'waiting' && !asks) {
      problems.push(`${row.id}: sits in waiting but has no ask or question`);
    }
    if (row.section === 'building') {
      if (!filled(row.session) && !filled(row.pr)) {
        problems.push(`${row.id}: sits in building but names no session or PR`);
      } else if (live) {
        const alive = (filled(row.session) && (live.sessions ?? []).includes(row.session)) || (filled(row.pr) && (live.prs ?? []).includes(row.pr));
        if (!alive) problems.push(`${row.id}: sits in building but its session or PR is not live`);
      }
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: board-lint.mjs <board.json>');
    process.exit(2);
  }
  const problems = lintBoard(JSON.parse(readFileSync(file, 'utf8')));
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log('board ok');
}
