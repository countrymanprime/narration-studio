import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { KIND_IDS, MARKED_KIND_IDS, kindDef } from './kinds/kindMap';
import { kindPairRows } from './kinds/kindPairs';

// One colour and one form per kind of highlighted thing (docs/research/finding-colours-and-chips.md section 5.2). The registry is
// `kinds/kindMap.ts`; this test fails when a page draws a kind with a map of its own. It is written like `badgeShapes.test.ts` (a
// per-file ceiling that may only go down, with a PENDING list naming each file still to migrate and the pull request that
// migrates it) and `highlightBoundary.test.ts` (it reads the TypeScript syntax tree, so a comment that mentions a kind is fine).
//
// 1. A file outside `kinds/` writes an object literal with two or more keys from the kind vocabulary whose values are colours
//    (`var(--`, a status tone, a Tailwind colour class).
// 2. A file under `components/` passes a literal `tone=` to a status or kind badge whose label is a kind of the vocabulary.
// 3. A file outside `kinds/` keeps a map of, a switch on, or an if-chain over the entity category names.
// 4. A `var(--name)` with no fallback names a custom property nothing defines (its own describe block, no ceiling).
// 5. Every registry kind has contrast rows for its mark and its chip, and no two marks share a colour and a shape.

const uiRoot = join(__dirname, '..');
const srcRoot = __dirname;

function scriptKind(fileName: string): ts.ScriptKind {
  return fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const posix = (path: string): string => relative(srcRoot, path).split(sep).join('/');
const isTest = (name: string): boolean => /\.(test|stories|spec)\.[cm]?tsx?$/.test(name);

// What counts as the kind vocabulary (the note's list; entity names are matched as written, kinds in any case).
const KIND_WORDS = new Set([
  'misread',
  'missing',
  'skip',
  'skipped',
  'extra',
  'repeat',
  'restart',
  'breath',
  'click',
  'noise',
  'plosive',
  'pacing',
  'low',
  'pron',
  'character',
  'place',
  'organization',
  'lore',
  'item',
  'event',
  'location',
  'review',
]);
const ENTITY_NAMES = new Set(['Character', 'Place', 'Organization', 'Lore', 'Item', 'Event', 'Location', 'Needs Review', 'Draft']);
const ENTITY_LOWER = new Set([...ENTITY_NAMES].map((name) => name.toLowerCase()));
const TONES = new Set(['neutral', 'info', 'progress', 'accent', 'success', 'warning', 'danger', 'org', 'experimental']);
const TAILWIND_COLOUR =
  /\b(?:text|bg|border|ring|fill|stroke|decoration)-(?:\[(?:color:)?var\(--|(?:red|orange|amber|yellow|green|emerald|teal|sky|blue|indigo|violet|purple|pink|rose|slate|gray|zinc|neutral|stone)-\d)/;
const KIND_LABEL =
  /^(?:misread|mispronounced|missing|skipped|extra(?: words)?|repeat(?:ed)?|restart|breath|click|noise|plosive|pacing|long silence|low confidence|pronunciation|character|place|location|organi[sz]ation|lore|item|event)$/i;
const BADGES = new Set(['StatusBadge', 'KindChip', 'Badge', 'Pill']);

type Hits = { colourMaps: number; literalTones: number; categoryMaps: number };

function hasBody(node: ts.Node): node is ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression {
  return (
    (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.body !== undefined
  );
}

function keyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
}

const isColourValue = (node: ts.Expression, file: ts.SourceFile): boolean => {
  if (ts.isStringLiteralLike(node) && TONES.has(node.text)) return true;
  const text = node.getText(file);
  return text.includes('var(--') || TAILWIND_COLOUR.test(text);
};

/** How many times a source file draws a kind its own way, by rule. */
export function scan(source: string, fileName = 'probe.tsx'): Hits {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind(fileName));
  const hits: Hits = { colourMaps: 0, literalTones: 0, categoryMaps: 0 };
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const props = node.properties.filter((prop): prop is ts.PropertyAssignment => ts.isPropertyAssignment(prop));
      const kinds = props.filter((prop) => KIND_WORDS.has(keyName(prop.name)?.toLowerCase() ?? ''));
      if (kinds.filter((prop) => isColourValue(prop.initializer, file)).length >= 2) hits.colourMaps += 1;
      const entities = props.filter((prop) => ENTITY_NAMES.has(keyName(prop.name) ?? ''));
      if (entities.length >= 2) hits.categoryMaps += 1;
    } else if (ts.isSwitchStatement(node)) {
      const cases = node.caseBlock.clauses.filter((clause): clause is ts.CaseClause => ts.isCaseClause(clause) && ts.isStringLiteralLike(clause.expression));
      if (cases.filter((clause) => ENTITY_NAMES.has((clause.expression as ts.StringLiteral).text)).length >= 2) hits.categoryMaps += 1;
    } else if (hasBody(node)) {
      // An if-chain over the category names, written `key === 'character'` after a lower-casing.
      const seen = new Set<string>();
      const look = (child: ts.Node): void => {
        if (
          ts.isBinaryExpression(child) &&
          [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(child.operatorToken.kind)
        ) {
          for (const side of [child.left, child.right]) if (ts.isStringLiteralLike(side) && ENTITY_LOWER.has(side.text)) seen.add(side.text);
        }
        if (!(ts.isFunctionLike(child) && child !== node)) ts.forEachChild(child, look);
      };
      look(node.body!);
      if (seen.size >= 2) hits.categoryMaps += 1;
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (BADGES.has(node.tagName.getText(file))) {
        const attributes = node.attributes.properties.filter((attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute));
        const literal = (name: string): string | undefined => {
          const initializer = attributes.find((attribute) => attribute.name.getText(file) === name)?.initializer;
          if (!initializer) return undefined;
          if (ts.isStringLiteral(initializer)) return initializer.text;
          if (ts.isJsxExpression(initializer) && initializer.expression && ts.isStringLiteralLike(initializer.expression)) return initializer.expression.text;
          return undefined;
        };
        const tone = literal('tone');
        const label = literal('label');
        if (tone !== undefined && label !== undefined && KIND_LABEL.test(label.trim())) hits.literalTones += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return hits;
}

const total = (hits: Hits): number => hits.colourMaps + hits.literalTones + hits.categoryMaps;

// Not a kind drawn its own way, with the reason. The count is not pinned: the file is skipped.
const NOT_A_COLOUR_MAP: Record<string, string> = {
  'state.ts': 'maps a category value to its display label ("Place" is shown as "Location"), not to a colour',
};

const scanned = new Map<string, Hits>(
  walk(srcRoot)
    .filter(
      (path) =>
        /\.[cm]?tsx?$/.test(path) &&
        !isTest(path) &&
        !posix(path).startsWith('kinds/') &&
        !posix(path).startsWith('api/') &&
        !(posix(path) in NOT_A_COLOUR_MAP),
    )
    .map((path) => [posix(path), scan(readFileSync(path, 'utf8'), path)] as const),
);

// Every file still to migrate: the file, the pull request of the plan (section 5.3) that migrates it, and its ceiling, the most
// hits it may have now. A ceiling above the real count fails, so an entry is lowered, or deleted at zero, in the same change that
// migrates the file. A file with a ceiling of 0 is listed because the note names it (a map the audit read) and its owner pull
// request still owes the page a pass; it is deleted when that pull request lands. Pull requests 2 to 7 shrink this list; nothing grows it.
const PENDING: Record<string, { owner: number; max: number }> = {
  'chapterStatus.ts': { owner: 7, max: 0 },
  'components/booth/CompanionShell.tsx': { owner: 7, max: 0 },
  'components/booth/bookmarks/BookmarkRibbons.tsx': { owner: 4, max: 0 },
  'components/delivery/page/Preflight.tsx': { owner: 7, max: 0 },
  'components/engine/LinkChaptersDialog.tsx': { owner: 7, max: 0 },
  'components/layout/EngineChip.tsx': { owner: 7, max: 0 },
  'components/manuscript/EntitySummary.tsx': { owner: 6, max: 4 },
  'components/master/RuleBadges.tsx': { owner: 7, max: 0 },
  'components/masterqc/page/PackageChecks.tsx': { owner: 7, max: 0 },
  'components/pickups/list/pickupRows.ts': { owner: 6, max: 0 },
  'components/primitives/Highlight.tsx': { owner: 4, max: 3 },
  'components/primitives/SpeakerTag.tsx': { owner: 5, max: 0 },
  'components/primitives/speakerColor.ts': { owner: 5, max: 0 },
  'components/production/RecordingCheckReport.tsx': { owner: 7, max: 0 },
  'components/production/overview/StageBar.tsx': { owner: 7, max: 0 },
  'components/production/overview/overviewFigures.ts': { owner: 7, max: 0 },
  'components/production/pipeline/NextUp.tsx': { owner: 7, max: 0 },
  'components/production/pipeline/PageHeader.tsx': { owner: 7, max: 0 },
  'components/production/pipeline/PipelineTable.tsx': { owner: 7, max: 0 },
  'components/production/readiness/verdict.ts': { owner: 7, max: 0 },
  'components/proof/flags.ts': { owner: 2, max: 0 },
  'components/proof/frame/ChapterStrip.tsx': { owner: 2, max: 0 },
  'components/schedule/MilestoneTable.tsx': { owner: 7, max: 0 },
  'components/schedule/VerdictPill.tsx': { owner: 7, max: 0 },
  'components/script/bookmarks/ui/BookmarkRibbon.tsx': { owner: 5, max: 0 },
  'components/script/page/chapters/CreditsSection.tsx': { owner: 5, max: 0 },
  'components/script/page/chapters/PrepDot.tsx': { owner: 7, max: 0 },
  'components/script/page/rail/bible/kinds.ts': { owner: 5, max: 1 },
  'components/script/page/rail/threads/markSwatch.ts': { owner: 5, max: 0 },
  'components/script/page/reader/Para.tsx': { owner: 5, max: 0 },
  'components/script/page/reader/markStyles.ts': { owner: 5, max: 0 },
  'components/script/page/tools/find/FindBar.tsx': { owner: 5, max: 0 },
  'components/settings/CapabilitySection.tsx': { owner: 7, max: 0 },
  'components/settings/CreditsPanel.tsx': { owner: 6, max: 0 },
  'components/settings/analysis/ToolRow.tsx': { owner: 7, max: 0 },
  'components/settings/controls/DefinitionsBody.tsx': { owner: 7, max: 0 },
  'components/settings/models/AssetRow.tsx': { owner: 7, max: 0 },
  'components/stages/StageSuggestion.tsx': { owner: 7, max: 0 },
  'components/storybible/FilterChip.tsx': { owner: 6, max: 0 },
  'components/storybible/Guide.tsx': { owner: 6, max: 0 },
  'components/storybible/entryList.ts': { owner: 6, max: 0 },
};

describe('the kind vocabulary has one home', () => {
  test('no file outside kinds/ draws a kind with a map of its own, beyond its PENDING ceiling', () => {
    const over = [...scanned].filter(([file, hits]) => total(hits) > (PENDING[file]?.max ?? 0)).map(([file, hits]) => `${file}: ${JSON.stringify(hits)}`);
    expect(over, 'draw the kind with kinds/kindMap.ts (kindDef, KindMark, KindChip), not a map of your own; a file in PENDING may not gain hits').toEqual([]);
  });

  test('a ceiling that is above the real count is lowered in the same change', () => {
    const stale = Object.entries(PENDING)
      .filter(([file, { max }]) => total(scanned.get(file) ?? { colourMaps: 0, literalTones: 0, categoryMaps: 0 }) < max)
      .map(([file, { max }]) => `${file}: ceiling ${max}, now ${total(scanned.get(file)!)}`);
    expect(stale, 'lower the ceiling to the real count, or delete the entry once the file is migrated').toEqual([]);
  });

  test('every PENDING entry names a file that exists and the pull request (2 to 7) that migrates it', () => {
    const files = new Set(walk(srcRoot).map(posix));
    for (const [file, { owner }] of Object.entries(PENDING)) {
      expect(files.has(file), `${file} is gone: delete its PENDING entry`).toBe(true);
      expect(owner, `${file} needs an owner pull request from the plan`).toBeGreaterThanOrEqual(2);
      expect(owner, file).toBeLessThanOrEqual(7);
    }
  });

  test('every exemption says why and names a file that exists', () => {
    const files = new Set(walk(srcRoot).map(posix));
    for (const [file, reason] of Object.entries(NOT_A_COLOUR_MAP)) {
      expect(files.has(file), file).toBe(true);
      expect(reason.length, file).toBeGreaterThan(20);
    }
  });

  test('the scan sees each way of drawing a kind its own way (a bad fixture per rule)', () => {
    expect(scan("const A = { misread: 'var(--danger)', extra: 'var(--info)' };").colourMaps).toBe(1);
    expect(scan("const A = { Misread: 'wavy', Extra: 'danger' as const, Skipped: 'danger' };").colourMaps).toBe(0);
    expect(scan("const A = { low: 'text-red-500', pron: 'text-[var(--info)]' };").colourMaps).toBe(1);
    expect(scan("const A = { misread: 'danger', extra: 'warning' };").colourMaps).toBe(1);
    expect(scan('const A = { misread: 1, extra: 2 };').colourMaps).toBe(0);
    expect(scan("// { misread: 'var(--danger)', extra: 'var(--info)' }\nconst s = \"{ misread: 'var(--x)', extra: 'var(--y)' }\";").colourMaps).toBe(0);
    expect(scan('const A = () => <StatusBadge tone="danger" label="Misread" />;').literalTones).toBe(1);
    expect(scan('const A = () => <StatusBadge tone="danger" label="Chapter 4" />;').literalTones).toBe(0);
    expect(scan('const A = ({ t }: { t: Tone }) => <StatusBadge tone={t} label="Misread" />;').literalTones).toBe(0);
    expect(scan('const A = { Character: 1, Place: 2 };').categoryMaps).toBe(1);
    expect(scan("function f(c: string) { switch (c) { case 'Character': return 1; case 'Place': return 2; default: return 0; } }").categoryMaps).toBe(1);
    expect(scan("function f(k: string) { if (k === 'character') return 1; if (k === 'place' || k === 'location') return 2; return 0; }").categoryMaps).toBe(1);
    expect(scan("function f(k: string) { return k === 'place'; }").categoryMaps).toBe(0);
  });
});

describe('every var(--name) without a fallback names a property something defines', () => {
  // The `--line` class of bug: a border drawn with a property nothing defines falls back to `currentcolor` and nobody sees it. No
  // ceiling: it fails on any new use. The properties set at runtime by a library are listed with the library.
  const RUNTIME: Record<string, string> = {
    '--available-height': "set by Base UI's positioner on a popup (the room left below its anchor)",
    '--anchor-width': "set by Base UI's positioner on a popup (the width of its anchor)",
  };
  const RUNTIME_PREFIXES = ['--tw-'];

  const texts = walk(srcRoot)
    .filter((path) => /\.(?:css|[cm]?tsx?)$/.test(path) && !/\.(test|spec)\.[cm]?tsx?$/.test(path))
    .map((path) => ({ file: posix(path), source: readFileSync(path, 'utf8') }));

  const defined = new Set<string>();
  for (const { source } of texts) {
    for (const match of source.matchAll(/(?<![\w-])(--[a-z0-9][\w-]*)\s*:/gi)) defined.add(match[1]);
    for (const match of source.matchAll(/['"`](--[a-z0-9][\w-]*)['"`]\s*[:\]]/gi)) defined.add(match[1]);
    for (const match of source.matchAll(/@property\s+(--[a-z0-9][\w-]*)/gi)) defined.add(match[1]);
    for (const match of source.matchAll(/setProperty\(\s*['"`](--[a-z0-9][\w-]*)['"`]/gi)) defined.add(match[1]);
  }

  /** Every `var(--x)` with no fallback, with the file that writes it. */
  function uses(): { file: string; name: string }[] {
    return texts.flatMap(({ file, source }) =>
      [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/var\(\s*(--[a-z0-9][\w-]*)\s*\)/gi)].map((match) => ({ file, name: match[1] })),
    );
  }

  test('no source file uses a custom property nothing defines', () => {
    const undefinedUses = uses().filter(({ name }) => !defined.has(name) && !(name in RUNTIME) && !RUNTIME_PREFIXES.some((prefix) => name.startsWith(prefix)));
    expect(
      undefinedUses.map(({ file, name }) => `${file}: var(${name})`),
      'define the property in styles.css, or use the token that exists (--border, --warn-soft, --surface-2, --radius-card)',
    ).toEqual([]);
  });

  test('the scan reads the properties styles.css defines', () => {
    for (const name of ['--border', '--warn-soft', '--surface-2', '--radius-card', '--line-strong', '--danger-text'])
      expect(defined.has(name), name).toBe(true);
    for (const name of ['--line', '--warning-soft', '--surface-muted', '--radius-panel', '--radius', '--bookmark']) expect(defined.has(name), name).toBe(false);
  });

  test('every runtime property says which library sets it', () => {
    for (const [name, reason] of Object.entries(RUNTIME)) expect(reason.length, name).toBeGreaterThan(10);
  });
});

describe('every registry kind has its contrast rows, and no two marks look alike', () => {
  const paletteSource = readFileSync(join(__dirname, 'paletteContrast.test.ts'), 'utf8');

  test('paletteContrast.test.ts measures the rows the registry derives', () => {
    expect(paletteSource).toContain('kindPairRows()');
  });

  test('each kind has a chip-text row, and a mark-text and mark-line row when it has a text mark', () => {
    const rows = kindPairRows();
    for (const id of KIND_IDS) {
      const roles = new Set(rows.filter((row) => row.kind === id).map((row) => row.role));
      expect(roles.has('chip-text'), `${id} has no chip row`).toBe(true);
      expect(roles.has('mark-text') && roles.has('mark-line'), `${id}${kindDef(id).mark ? ' has no mark rows' : ''}`).toBe(kindDef(id).mark !== null);
    }
  });

  test('each pair is declared once, and a dashed chip measures its border', () => {
    const ids = kindPairRows().map((row) => row.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    for (const id of KIND_IDS.filter((kind) => kindDef(kind).dashed))
      expect(
        kindPairRows().some((row) => row.kind === id && row.role === 'chip-line'),
        id,
      ).toBe(true);
  });

  test('no two text marks share a colour and a shape, and no two kinds share a label', () => {
    const marks = MARKED_KIND_IDS.map((id) => `${kindDef(id).hue}/${kindDef(id).mark?.shape}`);
    expect(marks.filter((mark, index) => marks.indexOf(mark) !== index)).toEqual([]);
    const labels = KIND_IDS.map((id) => kindDef(id).label);
    expect(labels.filter((label, index) => labels.indexOf(label) !== index)).toEqual([]);
  });

  test('the repository root is where the test reads from', () => {
    expect(uiRoot.endsWith(join('apps', 'ui'))).toBe(true);
  });
});
