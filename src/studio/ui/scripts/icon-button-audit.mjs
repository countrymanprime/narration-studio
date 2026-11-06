#!/usr/bin/env node
/* global console, process */
// Lists every text <Button> in src/components (stories and tests skipped): file, line, variant, label text, and the nearest
// enclosing context hint (row/toolbar/list/dialog footer). Run: node scripts/icon-button-audit.mjs [--json]
import fs from 'node:fs';
import { auditButtons, escapeCell } from './iconButtonAudit.mjs';

const out = auditButtons();
if (process.argv.includes('--md')) {
  // `--after=<json>` is this script's `--json` output on the tree after the change: a non-keep row of the tree before that is gone from it was converted.
  const afterPath = process.argv.find((a) => a.startsWith('--after='))?.slice(8);
  const left = new Map();
  if (afterPath)
    for (const r of JSON.parse(fs.readFileSync(afterPath, 'utf8'))) {
      const k = `${r.file}|${r.label}`;
      left.set(k, (left.get(k) ?? 0) + 1);
    }
  for (const r of out) {
    const k = `${r.file}|${r.label}`;
    if (afterPath && r.class !== 'keep') {
      if ((left.get(k) ?? 0) > 0) left.set(k, left.get(k) - 1);
      else r.converted = true;
    }
  }
  const status = (r) => (r.converted ? 'converted' : r.class === 'convert' ? 'convert (queued)' : r.class === 'review' ? 'decide (queued)' : 'keep');
  const esc = escapeCell;
  const count = (f) => out.filter(f).length;
  console.log(
    `Totals: **${out.length}** buttons found; **${count((r) => status(r) === 'converted')}** converted in this change; **${count((r) => status(r) === 'convert (queued)')}** mapped to a catalogue action and queued; **${count((r) => status(r) === 'decide (queued)')}** need a catalogue decision; **${count((r) => r.class === 'keep')}** kept as text with a reason.\n`,
  );
  console.log('| Source | Variant | Context | Label | Status | Action or reason |\n| - | - | - | - | - | - |');
  for (const r of out)
    console.log(
      `| \`${r.file.replace('components/', '')}:${r.line}\` | ${esc(String(r.variant))} | ${r.context} | ${esc(r.label) || '(icon)'} | ${status(r)} | ${esc(r.target ?? r.reason ?? '')} |`,
    );
} else if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else if (process.argv.includes('--summary')) {
  const c = {};
  for (const r of out) c[r.class] = (c[r.class] ?? 0) + 1;
  console.log(c);
} else for (const r of out) console.log(`${r.file}:${r.line}\t${r.variant}\t${r.context}\t${r.class}\t${r.target ?? r.reason ?? ''}\t${r.label}`);
console.error(`${out.length} <Button> usages in ${new Set(out.map((r) => r.file)).size} files`);
