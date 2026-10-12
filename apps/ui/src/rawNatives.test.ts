// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';

// ADR 0053 (and ADR 0056 for the table parts): a page builds a control from a primitive (`IconButton`, `TextField`, `SearchField`, `Select`, `Field`, ...) and
// not from the native element, so every control looks and behaves one way. This scan counts the native elements written in
// JSX outside `components/primitives/`, per file, and a file's count may only go down: a ceiling that is higher than the real
// count fails, so the entry is lowered (or deleted at zero) in the same change, and a file with no entry may have none. The
// controls the primitives cover have no entry: `Select`, `TextField`, `Field` and `Table`.
// No file outside the primitives may paste the icon-button look either (`size-8` with `rounded-md`).
//
// The escape is a comment: a native element with `native-control-ok: <why>` (at least 12 characters) in a comment on its first
// line or on the line directly above is not counted, whatever its tag. A marker with no native element there is stale and
// fails. `ZERO_DIRS` lists the Studio Next folders built to the mock: nothing in them may carry a ceiling or an unmarked native
// element. A page swap adds its new folder to `ZERO_DIRS` in the PR that creates it and deletes the old page's `CEILING`
// entries in the same PR (the stale check fails otherwise).
//
// Buttons stay a ratchet rather than a ban (text buttons already have `Button`, and the bare ones
// left are a toast's dismiss, a card that is a button, a list row). A new file with a raw `<button>` needs an entry, which is
// a review-visible decision: prefer `Button`, `IconButton` or a new primitive.
const NATIVE_TAGS = ['button', 'select', 'input', 'textarea', 'table', 'thead', 'tbody', 'tr', 'th', 'td'] as const;
type NativeTag = (typeof NATIVE_TAGS)[number];

// Native elements written in JSX per file, outside the primitives, at the time of ADR 0053 (no native select, input, textarea or table part is left).
const CEILING: Record<NativeTag, Record<string, number>> = {
  button: {
    // The header's "Jump to or run…" field (the mock's top bar): a search-shaped trigger with a label and a key chord, which Button's
    // padded, uppercase chrome and IconButton's square do not draw. One JSX `<button>`.
    'src/components/layout/AppShell.tsx': 1,
    'src/components/manuscript/ChapterNav.tsx': 4,
    // The card's bookmark toggle and its whole-header toggle. `CreditsEntry.tsx`
    // renders through this and has no raw button of its own (ceiling 0 below).
    'src/components/manuscript/ReaderCard.tsx': 2,
    // The recent-project card (a card that is a button). Its Remove and Create new clones became IconButton and Button (ADR 0595).
    'src/components/project/ProjectPicker.tsx': 1,
    // The Script page's chapter list (mock 02): a list row naming the
    // chapter with its current state, the same shape as ChapterNav's rows, which Button's padded, uppercase chrome does not
    // fit. One JSX `<button>`, written once inside the chapters `.map()`.
    'src/components/script/ScriptChapterList.tsx': 1,
    // The Script rail's names: a name in a table cell or a list row that opens its Story Bible summary, the same
    // case as ReaderRail.tsx's entries below. Two JSX `<button>`s, one inside the Pronunciations rows and one inside the
    // Characters rows.
    'src/components/script/ScriptRail.tsx': 2,
    // The click-to-seek word ("Start here" / "Go back to here"):
    // one word among hundreds inside running prose, so it needs `Button`'s bare click/keyboard semantics without its
    // padded, uppercase button chrome, which would break the text flow and read as a real action button rather than a
    // word. One JSX `<button>` in the source (it is written once, inside the words `.map()`, not once per word).
    'src/components/booth/ReaderText.tsx': 1,
    // The read-aloud rail's Story bible entries: a list row with a
    // category dot and a current state, the same shape as ChapterNav's rows, which Button's padded, uppercase chrome does
    // not fit. One JSX `<button>`, written once inside the entries `.map()`.
    // The read-aloud rail's Flags list: the same list row as the Story
    // bible entries above (two lines of text and a current state), which Button's padded, uppercase chrome does not fit. One
    // JSX `<button>`, written once inside the flags `.map()`.
    // The engine panel took the Tracks page's two: its .rpp picker's
    // full-width path rows (a mono file path, which Button's uppercase chrome would mangle) stay one JSX `<button>` inside the
    // candidates `.map()`; the track rows' selection buttons went with the player.
    'src/components/engine/EnginePanel.tsx': 1,
    // The chapter workspace's clickable script words: the same case as
    // ReaderText.tsx above - one word among a chapter's worth of running prose, needing Button's bare click/keyboard
    // semantics without its padded, uppercase chrome breaking the text flow. One JSX `<button>`, written once inside
    // the tokens `.map()`.
    'src/components/proof/ScriptView.tsx': 1,
    // The resume prompt's disagree choice ("a card that is a button" - two places, REAPER
    // and Last reading - written once as `card()`, called twice): `Button`'s uppercase chrome does not fit a card naming a
    // source, a time and a quoted sentence. (Its text links are `Button variant="link"`, ADR 0595, like every underlined
    // text action inside a sentence.)
    'src/components/booth/ResumePrompt.tsx': 1,
  },
  select: {},
  // The Pickups page's CSV picker is a hidden native `<input type="file">`
  // triggered by a `Button` (ADR 0053's own escape hatch for file-choosing, since a file picker's OS chrome cannot be
  // restyled the way a text input or select can - the same reason `ManuscriptSelectFile` uses a native OS dialog).
  // The re-import file picker (`PronunciationQueries.tsx`) is the same pattern, one hidden
  // `<input type="file">` triggered by a `Button`.
  // Proof's notes header opens the proofer's sheet with the same hidden file picker as the Pickups page (ADR 0470).
  input: { 'src/components/pickups/PickupsPage.tsx': 1, 'src/components/proof/NotesHeader.tsx': 1, 'src/components/storybible/PronunciationQueries.tsx': 1 },
  textarea: {},
  table: {},
  thead: {},
  tbody: {},
  tr: {},
  th: {},
  td: {},
};

// Folders built to the mock: no ceiling, no unmarked native element.
const ZERO_DIRS = [
  'src/components/schedule/',
  'src/components/production/readiness/',
  'src/components/production/pipeline/',
  'src/components/production/overview/',
  'src/components/proof/checkcard/',
];

const MARKER = 'native-control-ok:';
const MIN_REASON = 12;

const uiRoot = join(__dirname, '..');
const srcRoot = join(uiRoot, 'src');
const primitivesDir = join('src', 'components', 'primitives');
const SOURCE = /\.tsx$/;
const NOT_UNDER_TEST = /\.(test|stories)\.tsx$/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return SOURCE.test(entry.name) && !NOT_UNDER_TEST.test(entry.name) ? [path] : [];
  });
}

type Found = { tags: Record<string, number>; pastedIconButtonLook: number; problems: string[] };

type Marker = { line: number; reason: string };

// Every comment the parser sees, found through the tokens' trivia so a string or JSX text that only looks like one is skipped.
function commentsOf(file: ts.SourceFile): ts.CommentRange[] {
  const seen = new Map<number, ts.CommentRange>();
  const text = file.text;
  const walk = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.JsxText) return;
    for (const range of [...(ts.getLeadingCommentRanges(text, node.pos) ?? []), ...(ts.getTrailingCommentRanges(text, node.end) ?? [])])
      seen.set(range.pos, range);
    for (const child of node.getChildren(file)) walk(child);
  };
  walk(file);
  return [...seen.values()];
}

function markersOf(file: ts.SourceFile): Marker[] {
  const markers: Marker[] = [];
  for (const range of commentsOf(file)) {
    const comment = file.text.slice(range.pos, range.end);
    const at = comment.indexOf(MARKER);
    if (at < 0) continue;
    const reason = comment
      .slice(at + MARKER.length)
      .split('\n')[0]
      .replace(/\*\/\s*$/, '')
      .trim();
    markers.push({ line: file.getLineAndCharacterOfPosition(range.pos + at).line + 1, reason });
  }
  return markers;
}

// A tag counts once per element, whether it opens with children or is self-closing. Read with the TypeScript parser, so a
// comment or a string that only mentions `<select>` is fine, and a component named `Select` is not the native `select`.
// A native element with a `native-control-ok: <why>` comment on its line or the line above is left out of the count.
function scan(source: string, fileName = 'probe.tsx'): Found {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Found = { tags: {}, pastedIconButtonLook: 0, problems: [] };
  const elements: { name: string; line: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      elements.push({ name: node.tagName.getText(file), line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const tokens = node.text.split(/\s+/);
      if (tokens.includes('size-8') && tokens.includes('rounded-md')) found.pastedIconButtonLook++;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  const covered = new Set<(typeof elements)[number]>();
  for (const marker of markersOf(file)) {
    const targets = elements.filter((el) => (NATIVE_TAGS as readonly string[]).includes(el.name) && (el.line === marker.line || el.line === marker.line + 1));
    if (targets.length === 0) {
      found.problems.push(`${fileName}:${marker.line}: stale ${MARKER} marker: no native element on this line or the next; delete the marker with its control`);
    } else if (marker.reason.length < MIN_REASON) {
      found.problems.push(`${fileName}:${marker.line}: ${MARKER} needs a reason of at least ${MIN_REASON} characters saying why no primitive fits`);
    }
    for (const el of targets) covered.add(el);
  }
  for (const el of elements) if (!covered.has(el)) found.tags[el.name] = (found.tags[el.name] ?? 0) + 1;
  return found;
}

const pageFiles = tsxFiles(srcRoot)
  .map((file) => relative(uiRoot, file))
  .filter((file) => !file.startsWith(primitivesDir + sep));

describe('native controls stay inside the primitives (ADR 0053)', () => {
  const scans = pageFiles.map((file) => [file.split(sep).join('/'), scan(readFileSync(join(uiRoot, file), 'utf8'), file)] as const);

  test.each(NATIVE_TAGS)('raw <%s> counts only go down', (tag) => {
    const ceiling = CEILING[tag];
    const counts: Record<string, number> = {};
    for (const [file, found] of scans) {
      const count = found.tags[tag] ?? 0;
      if (count > 0) counts[file] = count;
    }
    const grew = Object.entries(counts).filter(([file, count]) => count > (ceiling[file] ?? 0));
    expect(
      grew,
      `a page gained a native <${tag}>: use the primitive (docs/design/design-system.md) or add one; raising a ceiling needs a reason in the pull request`,
    ).toEqual([]);
    const stale = Object.entries(ceiling).filter(([file, allowed]) => (counts[file] ?? 0) < allowed);
    expect(stale, `a page lost a native <${tag}>: lower its ceiling (delete the entry at zero)`).toEqual([]);
  });

  test('every native-control-ok marker has a reason and a native element (tests 2 and 3)', () => {
    expect(scans.flatMap(([, found]) => found.problems)).toEqual([]);
  });

  test('zero-dirs-allow-no-unmarked-native: a Studio Next folder has no ceiling and no unmarked native element', () => {
    const under = (file: string) => ZERO_DIRS.some((dir) => file.startsWith(dir));
    const unmarked = scans.filter(([file, found]) => under(file) && Object.keys(found.tags).some((tag) => (NATIVE_TAGS as readonly string[]).includes(tag)));
    expect(
      unmarked.map(([file]) => file),
      'a native element in a ZERO_DIRS folder needs `native-control-ok: <why>` or a primitive',
    ).toEqual([]);
    const ceilings = NATIVE_TAGS.flatMap((tag) =>
      Object.keys(CEILING[tag])
        .filter(under)
        .map((file) => `${tag}: ${file}`),
    );
    expect(ceilings, 'a ZERO_DIRS folder starts at zero: mark the element with `native-control-ok: <why>` instead of a ceiling').toEqual([]);
  });

  test('zero-dirs-must-exist: every ZERO_DIRS path has a file under it', () => {
    const files = scans.map(([file]) => file);
    expect(
      ZERO_DIRS.filter((dir) => !files.some((file) => file.startsWith(dir))),
      'a deleted folder takes its ZERO_DIRS line with it',
    ).toEqual([]);
  });

  test('no page pastes the icon-button look', () => {
    const offenders = scans.filter(([, found]) => found.pastedIconButtonLook > 0).map(([file]) => file);
    expect(offenders, 'use <IconButton label="...">').toEqual([]);
  });

  test('the scan sees each way of writing the native controls (a bad fixture per form)', () => {
    expect(scan('const a = <select value="x" />;').tags).toEqual({ select: 1 });
    expect(scan('const a = <input />;').tags).toEqual({ input: 1 });
    expect(scan('const a = <textarea>hi</textarea>;').tags).toEqual({ textarea: 1 });
    expect(scan('const a = <table className="dtable"><tbody /></table>;').tags).toEqual({ table: 1, tbody: 1 });
    expect(scan('const a = <button type="button">x</button>;').tags).toEqual({ button: 1 });
    expect(scan('const a = <button className="inline-flex size-8 rounded-md border" />;').pastedIconButtonLook).toBe(1);
    expect(scan('const a = <button className={`size-8 rounded-md ${x}`} />;').pastedIconButtonLook).toBe(1);
  });

  test('the scan ignores primitives with the same name, comments and strings', () => {
    expect(scan('const a = <Select label="x" />;').tags).toEqual({ Select: 1 });
    expect(scan('// <select> is banned\nconst a = "<input />";').tags).toEqual({});
    expect(scan('const a = <div className="size-8" />;').pastedIconButtonLook).toBe(0);
  });

  describe('native-control-ok fixtures', () => {
    test('marker-allows-a-native-tag: on the line above, on the first line, for any tag', () => {
      for (const tag of NATIVE_TAGS) {
        const above = scan(`const a = (\n  // native-control-ok: a reason that is long enough\n  <${tag} />\n);`);
        expect(above.tags).toEqual({});
        expect(above.problems).toEqual([]);
      }
      expect(scan('const a = <input /> /* native-control-ok: hidden file picker */;').tags).toEqual({});
      expect(scan('const a = (\n  <div>\n    {/* native-control-ok: the verdict mark needs its own name */}\n    <button />\n  </div>\n);').tags).toEqual({
        div: 1,
      });
    });

    test('marker-needs-a-reason: empty or under 12 characters fails with file and line', () => {
      for (const reason of ['', ' ', ' too short']) {
        const bad = scan(`const a = (\n  // native-control-ok:${reason}\n  <input />\n);`, 'src/x.tsx');
        expect(bad.problems).toHaveLength(1);
        expect(bad.problems[0]).toContain('src/x.tsx:2');
        expect(bad.problems[0]).toContain('reason');
      }
    });

    test('marker-must-sit-on-a-native-tag: a marker with no native element on its line or the next is stale', () => {
      const stale = scan('// native-control-ok: the control was deleted\nconst a = <Select />;', 'src/y.tsx');
      expect(stale.problems).toHaveLength(1);
      expect(stale.problems[0]).toContain('src/y.tsx:1');
      expect(stale.problems[0]).toContain('stale');
      expect(scan('// native-control-ok: two lines too far away\n\n<input />;').problems).toHaveLength(1);
    });

    test('marker-in-a-string-is-ignored: the text inside a string or template is not a marker', () => {
      expect(scan('const s = "native-control-ok: a reason that is long enough";\nconst a = <input />;')).toMatchObject({ tags: { input: 1 }, problems: [] });
      expect(scan('const s = `native-control-ok: a reason that is long enough`;\nconst a = <input />;')).toMatchObject({ tags: { input: 1 }, problems: [] });
      expect(scan('const a = <p>native-control-ok: a reason that is long enough</p>;\nconst b = <input />;')).toMatchObject({
        tags: { input: 1 },
        problems: [],
      });
    });
  });
});
