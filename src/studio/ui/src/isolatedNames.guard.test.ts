// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Class guard for #4113 (definition of done, rule 1): a name the narrator or an author chose (a chapter title, a track, a character, a profile, a file) that goes into the sentence of a toast is
// wrapped in `isolatedIfRtl` (`visibleText.ts`), or a right-to-left name at the start of the sentence turns the whole line around and the full stop or a count jumps to the wrong side. This test reads
// the source: in every call that raises a toast (`overlay.toast`, `overlay.toastUndo`, `notify`, `say`) it looks at each `${expression}` inside a template literal, and an expression that reads like a name
// (an identifier ending in name, title, label, path or quote) and is not wrapped fails. A name the app itself defines (a setting's label, a product's name) is allowed with the reason, so a new or missed
// builder fails here instead of in front of a narrator. Not read: a sentence built in a helper that the call receives as a value (`chapterSyncToastText.ts` and `toastSentences.ts` are read whole, being
// toast builders), a sentence joined with `+`, and `overlay.announce` (it is read out, never drawn); the builders in `engine/destination.ts` have unit tests of their own (`destination.test.ts`).
const SRC = __dirname;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.tsx?$/.test(name) && !/\.(test|stories|guard\.test)\.tsx?$/.test(name)) yield path;
  }
}

/** Files that are toast builders: every template literal in them is a toast sentence. */
const BUILDERS = new Set(['components/production/chapterSyncToastText.ts', 'components/booth/toastSentences.ts']);
const CALL = /(?:\boverlay\.toast|\boverlay\.toastUndo|\bnotify|\bsay)\(/g;
const NAMEISH = /\b\w*(?:[Nn]ame|[Tt]itle|[Ll]abel|[Pp]ath|[Qq]uote)\b/;
const WRAPPED = /\b(?:isolatedIfRtl|bidiIsolated)\(|^\s*(?:plural|formatCount)\(/;

/** The text of the call's arguments: from after its opening parenthesis to the matching one, skipping what is inside strings and templates' own braces. */
function argumentsOf(source: string, open: number): string {
  let depth = 1;
  let i = open;
  const templates: number[] = []; // brace depth at which each open template literal's `${` began
  let quote = '';
  while (i < source.length && depth > 0) {
    const ch = source[i]!;
    if (quote === '`') {
      if (ch === '\\') i++;
      else if (ch === '`') quote = '';
      else if (ch === '$' && source[i + 1] === '{') {
        templates.push(depth);
        quote = '';
        depth++;
        i++;
      }
    } else if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
    } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(' || ch === '{') depth++;
    else if (ch === ')' || ch === '}') {
      depth--;
      if (ch === '}' && templates.length > 0 && templates[templates.length - 1] === depth) {
        templates.pop();
        quote = '`';
      }
    }
    i++;
  }
  return source.slice(open, i - 1);
}

/** Each `${expression}` of each template literal in the text (expressions that nest a template are read whole). */
function interpolations(text: string): string[] {
  const found: string[] = [];
  let inTemplate = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '`') inTemplate = !inTemplate;
    else if (inTemplate && ch === '$' && text[i + 1] === '{') {
      // The expression runs to the brace that closes this one; a template inside it is read as part of it.
      const start = i + 2;
      let depth = 1;
      let j = start;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      found.push(text.slice(start, j - 1));
      i = j - 1;
    }
  }
  return found;
}

/** A name the app itself defines, not a narrator's or an author's: allowed, with why. The key is `<file>: <expression>`. */
const APP_DEFINED: Record<string, string> = {
  'components/booth/page/useBoothPage.ts: stopped.refused ?? `${stopped.message} Stop it in ${recorderLabel}.`':
    "the host's own sentence and a DAW product name",
  'components/booth/page/useBoothPage.ts: undone.refused ?? `${undone.message} Undo it in ${recorderLabel}.`': "the host's own sentence and a DAW product name",
  'components/booth/record/RecordSetup.tsx: Name': 'the name of a DAW product (REAPER, Audacity)',
  'components/booth/toastSentences.ts: recorderName(daw)': 'the name of a DAW product (REAPER, Audacity)',
  'components/booth/toastSentences.ts: name': 'the name of a DAW product, given by the caller',
  'components/booth/toastSentences.ts: dawName': 'the name of a DAW product (REAPER, Audacity)',
  'components/connection/useReaperLaunch.ts: name': 'the name of the DAW product the launch started',
  'components/script/page/data/useScriptData.ts: kind?.name ?? type': 'the name of a note kind the app defines',
  'components/storybible/GuideDetail.tsx: capitalize(stuck.label)': "the label of a field of the Story Bible form, the app's own wording",
  'components/settings/row/SettingRowView.tsx: row.label': "the label of a setting, the app's own English wording",
  'components/proof/ProofPage.tsx: noteRow(next).resolution.label': 'the label of a resolution kind the app defines ("Fine as read")',
  'components/proof/CompareRun.tsx: modelLabel(value)': 'the name of a model the app ships',
  'components/proof/CompareRun.tsx: dawName': 'the name of a DAW product (REAPER, Audacity)',
  'components/booth/leave/useBoothLeaveGuard.ts: now.daw.name': 'the name of a DAW product (REAPER, Audacity)',
  'components/booth/record/useRecordControl.ts: recorderName(capabilitiesRef.current?.daw)': 'the name of a DAW product (REAPER, Audacity)',
};

type Hit = { file: string; expression: string };

function scan(): { hits: Hit[]; seen: Set<string> } {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  for (const path of sources(SRC)) {
    const file = relative(SRC, path).split(sep).join('/');
    const source = readFileSync(path, 'utf8');
    const texts: string[] = [];
    if (BUILDERS.has(file)) texts.push(source);
    else
      for (const match of source.matchAll(CALL)) {
        // A function's own declaration (`const say = (…`) is not a call.
        if (/(?:const|function|let)\s+\w*$/.test(source.slice(Math.max(0, match.index - 12), match.index + match[0].length - 1))) continue;
        texts.push(argumentsOf(source, match.index + match[0].length));
      }
    for (const text of texts)
      for (const expression of interpolations(text)) {
        if (!NAMEISH.test(expression) || WRAPPED.test(expression)) continue;
        const key = `${file}: ${expression.trim()}`;
        seen.add(key);
        if (!(key in APP_DEFINED)) hits.push({ file, expression: expression.trim() });
      }
  }
  return { hits, seen };
}

describe('every name in a toast sentence is isolated (#4113)', () => {
  const { hits, seen } = scan();

  it('wraps each narrator or author name in isolatedIfRtl, or is allowed here with a reason', () => {
    expect(
      hits.map(
        (hit) =>
          `${hit.file}: \${${hit.expression}} goes into a toast sentence without isolatedIfRtl (visibleText.ts); wrap it, or add it to APP_DEFINED with why it is the app's own word`,
      ),
    ).toEqual([]);
  });

  it('keeps no allowed name that is no longer in a toast', () => {
    expect(Object.keys(APP_DEFINED).filter((key) => !seen.has(key))).toEqual([]);
  });

  it('finds the calls it is meant to read (the scan is not empty)', () => {
    expect(seen.size).toBeGreaterThan(5);
  });
});
