#!/usr/bin/env node
// The analysis behind the icon-button audit and its guard test. Lists every text <Button> in src/components (stories and tests skipped): file, line, variant, label text, and the nearest
// enclosing context hint (row/toolbar/list/dialog footer). Run: node scripts/icon-button-audit.mjs [--json]
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/components');
// ---- classification -------------------------------------------------------------------------------------------------
// keep:    stays text.  convert: becomes an IconButton with the catalogue action named.  review: no rule applies; needs the owner's eye.
// CONVERT maps a label to the catalogue key (a key marked + is a row this audit's PR adds).
const CONVERT = [
  [/^Retry\b/, 'retry'],
  [/^(Check again|Check now|Test connection)$/, '+checkAgain'],
  [/^(Refresh the list|Read current stamps)$/, '+checkAgain'],
  [/^Open (the )?folder/, 'openFolder'],
  [/^Undo$/, 'undo'],
  [/^Clear$/, '+clearLink'],
  [/^Change( file| linked file)?$|^Change file…$/, '+changeLink'],
  [/^(Link file…|Choose a project file|Link the open project…)$/, '+linkFile'],
  [/^Link$/, '+linkTrack'],
  [/^Unlink$/, '+unlink'],
  [/^(Turn on|Turn off)$/, '+turnOnOff'],
  [/^Play this lane$/, 'play'],
  [/^Remove\b/, 'remove'],
  [/^Copy (path|prompt|details)/, 'copy'],
  [/^Cancel$/, 'cancelEdit'],
  [/^Accept$/, 'accept'],
  [/^Ignore$/, 'dismiss'],
  [/^Mark reviewed$/, 'markReviewed'],
  [/^Duplicate\b/, '+duplicate'],
  [/^Restore$/, '+restore'],
  [/^Revoke$/, '+revoke'],
  [/^Unbind$/, '+unlink'],
  [/^Delete$/, 'delete'],
  [/^Open$/, '+openItem'],
  [
    /^(Go to (the note in )?Proof|Go to paragraph|Open in Editing|Open in Story Bible|Open Master & QC|Open Delivery|Open Booth|Open Production|Go to Production)/,
    'pageLink',
  ],
  [/^(Preview|Stop preview)$/, 'hear'],
  [/^Reset( to default)?$/, '+reset'],
  [/^(New|Add|Add name|Add note|Add entry)$/, 'add'],
  [/^Save key$|^Test key$|^Test sound$/, 'review'],
  [/^Check recordings…?$/, 'checkRecordings'],
  [/^(Hear|Listen)\b/, 'hear'],
  [/^Pause$/, 'pause'],
  [/^Resume$/, 'play'],
  [/^Hide$/, 'dismiss'],
  [/^(Stop checking|Stop timer|Cancel scan)$/, 'stop'],
  [/^Start timer$/, 'play'],
  [/^(Rescan|Read again)$/, 'retry'],
  [/^Show result$/, 'locate'],
  [/^(Merge into this entry|Use this|Use|Use suggestion|Use the new evidence|Keep this one)$/, '+useThis'],
  [/^Reply$/, 'addNote'],
  [/^(Discard changes|Clear sample|Clear credits|Reset all to defaults|Reset to defaults)$/, '+reset'],
  [/^Look up online$/, 'find'],
  [/^(Fill in|Fill them in Settings)$/, 'edit'],
  [/^Confirm$/, 'accept'],
  [/^Reopen$/, 'reopen'],
  [/^Compare$/, 'compare'],
  [/^Don.t ask for this project$/, 'dismiss'],
];
const DIALOG_FOOTER =
  /^(Cancel|Close|Save|Done|Not now|Back|Confirm|Create|Move|Export|Download|Add milestone|Save note|Save sample|Save profile|Continue in background|Retry|Don.t ask|Check in the background)/;
function classify(r) {
  const L = r.label;
  if (r.variant === 'link') {
    // A link-styled button in a row that names a catalogue verb is a row action drawn small (the sync log's Undo); elsewhere it sits in a sentence.
    const hit = r.context === 'row' ? CONVERT.find(([re]) => re.test(r.label)) : undefined;
    return hit && hit[1] !== 'review' ? ['convert', hit[1]] : ['keep', 'inline text action inside a sentence'];
  }
  if (/^\{.*'primary'/.test(String(r.variant))) return ['keep', 'primary action of its row or card while its state allows it'];
  if (r.variant === 'primary' || r.variant === 'danger-solid') return ['keep', 'primary action of its card, page or dialog'];
  if (r.context === 'dialog' && (DIALOG_FOOTER.test(L) || L.startsWith('{')))
    return ['keep', 'dialog footer decision (the catalogue lists Cancel and Save as text rows)'];
  if (r.tag === 'button') return ['keep', 'native button that is a whole row or a menu item (the label is the choice)'];
  if (/^(Reopen|Compare)$/.test(L)) return ['keep', 'text row in the catalogue (reopen, compare): no unambiguous icon'];
  if (/^(Pick a word|Choose a different one|Embed chapter tags|Configure render)/.test(L) || /^\{`?(Use|Ask|Start)/.test(L))
    return ['keep', 'sentence-length action that names its object, not one verb'];
  if (/^(Select all|Select none|All|None)$/.test(L)) return ['keep', 'a pair of group toggles; no unambiguous icon (catalogue rule 6)'];
  if (/^Back( to)?\b/.test(L)) return ['keep', 'navigation back, names its destination'];
  if (/^(Skip to |A\/B|A then B|30s)/.test(L)) return ['keep', 'skip link or a text-only value control (A/B, 30 s)'];
  if (L.startsWith('{') && r.context === 'row') return ['keep', 'option in a pick list: the label is the choice'];
  for (const [re, key] of CONVERT) if (re.test(L)) return key === 'review' ? ['review', ''] : ['convert', key];
  if (L === '') return ['keep', 'icon or custom content child (no text label)'];
  return ['review', 'needs a catalogue decision'];
}
export function auditButtons() {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name) && !/\.(test|stories)\.tsx$/.test(e.name)) files.push(p);
    }
  })(root);

  const attr = (el, name) => {
    const a = el.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.text === name);
    if (!a) return undefined;
    if (!a.initializer) return true;
    if (ts.isStringLiteral(a.initializer)) return a.initializer.text;
    return `{${a.initializer.expression?.getText() ?? ''}}`;
  };
  const labelOf = (node) => {
    const parts = [];
    for (const c of node.children ?? []) {
      if (ts.isJsxText(c)) {
        const t = c.text.replace(/\s+/g, ' ').trim();
        if (t) parts.push(t);
      } else if (ts.isJsxExpression(c) && c.expression) parts.push(`{${c.expression.getText().replace(/\s+/g, ' ').slice(0, 60)}}`);
      else if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) {
        const inner = ts.isJsxElement(c) ? labelOf(c) : '';
        if (inner) parts.push(inner);
      }
    }
    return parts.join(' ');
  };
  const CTX = [
    [/row|Row|\.map\(/, 'row'],
    [/toolbar|Toolbar|SelToolbar|Bar\b/, 'toolbar'],
    [/Dialog|SlideOver|footer|Footer/, 'dialog'],
    [/Card|Panel|Section/, 'panel'],
  ];
  const out = [];
  for (const f of files) {
    const src = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n, stack) => {
      const open = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null;
      const tag = open?.tagName.getText();
      if (open && (tag === 'Button' || tag === 'button')) {
        const label = ts.isJsxElement(n) ? labelOf(n) : '';
        const inMap = stack.some((s) => ts.isCallExpression(s) && /\.map$/.test(s.expression.getText()));
        const comps = stack.filter((s) => ts.isJsxElement(s)).map((s) => s.openingElement.tagName.getText());
        const fn =
          stack
            .filter((s) => ts.isFunctionDeclaration(s) || ts.isVariableDeclaration(s))
            .map((s) => s.name?.getText())
            .filter(Boolean)
            .pop() ?? '';
        const ctx = inMap ? 'row' : (CTX.find(([re]) => re.test(comps.join(' ') + ' ' + fn))?.[1] ?? 'page');
        out.push({
          file: path.relative(path.resolve(root, '..'), f),
          line: src.getLineAndCharacterOfPosition(open.getStart()).line + 1,
          component: fn,
          tag,
          variant: attr(open, 'variant') ?? (tag === 'button' ? 'native' : 'primary'),
          size: attr(open, 'size') ?? 'md',
          label,
          context: ctx,
          iconChild:
            ts.isJsxElement(n) && n.children.some((c) => (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) && /Icon/.test(c.getText().slice(0, 12))),
        });
      }
      ts.forEachChild(n, (c) => visit(c, [...stack, n]));
    };
    visit(src, []);
  }

  for (const r of out) {
    const [c, k] = classify(r);
    r.class = c;
    r[c === 'keep' ? 'reason' : 'target'] = k;
    r.group = r.file.split('/')[1];
  }
  out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return out;
}
