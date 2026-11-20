// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Class guard for #3680: a colour is chosen with `ColourField` (components/primitives/ColourField.tsx) and nowhere else, so a narrator
// picks from swatches or a picker and a hex box, never from a list of colour names, and every hex box settles the same way. The scan
// reads every source file under `src` (not tests, not stories, not `ColourField.tsx` itself) and reports three ways of building a
// colour control by hand:
//
// 1. `picker`: a native colour input, written `type="color"`, `type={'color'}` or `type: 'color'` (on `TextField` or any element).
// 2. `names`: a `Select`, `RadioGroup`, `ToggleGroup` or `Listbox` whose `label` says colour, or whose `options` (or `items`) are built
//    from one of the colour sets below.
// 3. `swatch`: outside the primitives, an inline `background` or `backgroundColor` filled from a token chosen at run time
//    (`var(--${…})`), which is `Swatch`'s job.
//
// What it does not see: a label held in a variable or built by a function, a `Menu` or `ContextMenu` of colour names, options built
// from a colour set under another name, a swatch drawn with a class (`bg-[var(--…)]`) or from a variable that already holds the
// `var()` text. Check those by hand in review.
//
// `ALLOWED` is shrink-only: a line is deleted when its control moves to `ColourField`, and a new one needs the owner's say-so and a
// reason. It is empty.
const ALLOWED: Record<string, string> = {};

const COLOUR_SETS = ['MARK_COLOURS', 'GUIDE_TYPE_COLOURS', 'HUE_NAMES', 'COLOUR_LABELS', 'COLOUR_OPTIONS', 'SPEAKER_COLOR_COUNT'];
const NAME_LISTS = ['Select', 'RadioGroup', 'ToggleGroup', 'Listbox'];
const SAYS_COLOUR = /colou?r/i;
const USES_A_COLOUR_SET = new RegExp(String.raw`\b(?:${COLOUR_SETS.join('|')})\b`);
const TOKEN_AT_RUN_TIME = /var\(--[\w-]*\$\{/;

const uiRoot = join(__dirname, '..');
const srcRoot = join(uiRoot, 'src');
const COLOUR_FIELD = 'src/components/primitives/ColourField.tsx';
const PRIMITIVES = 'src/components/primitives/';

type Kind = 'picker' | 'names' | 'swatch';
type Finding = { kind: Kind; line: number };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

/** The text of a JSX attribute's value: a string's own text, or the source of the expression in braces. */
function attributeText(attribute: ts.JsxAttribute, file: ts.SourceFile): string {
  const value = attribute.initializer;
  if (!value) return '';
  if (ts.isStringLiteral(value)) return value.text;
  if (ts.isJsxExpression(value) && value.expression) {
    return ts.isStringLiteralLike(value.expression) ? value.expression.text : value.expression.getText(file);
  }
  return '';
}

const isColourString = (node: ts.Node | undefined): boolean => Boolean(node && ts.isStringLiteralLike(node) && node.text === 'color');

/** Every hand-built colour control in `source`. `inPrimitives` turns the swatch rule off: a primitive may fill itself from a token. */
function scan(source: string, { inPrimitives = false, fileName = 'probe.tsx' } = {}): Finding[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Finding[] = [];
  const add = (kind: Kind, node: ts.Node) => found.push({ kind, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && node.name.getText(file) === 'type') {
      const value = node.initializer;
      if (isColourString(value) || (value && ts.isJsxExpression(value) && isColourString(value.expression))) add('picker', node);
    }
    if (ts.isPropertyAssignment(node)) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name) ? node.name.text : '';
      if (name === 'type' && isColourString(node.initializer)) add('picker', node);
      if (!inPrimitives && (name === 'background' || name === 'backgroundColor') && TOKEN_AT_RUN_TIME.test(node.initializer.getText(file))) add('swatch', node);
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && NAME_LISTS.includes(node.tagName.getText(file))) {
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      const text = (name: string) => attributes.filter((attribute) => attribute.name.getText(file) === name).map((attribute) => attributeText(attribute, file));
      const labelled = [...text('label'), ...text('aria-label')].some((label) => SAYS_COLOUR.test(label));
      const fromASet = [...text('options'), ...text('items')].some((options) => USES_A_COLOUR_SET.test(options));
      if (labelled || fromASet) add('names', node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

const kinds = (source: string, options?: { inPrimitives?: boolean }): Kind[] => scan(source, options).map((finding) => finding.kind);

describe('a colour is chosen with ColourField (#3680)', () => {
  const files = sourceFiles(srcRoot)
    .map((path) => relative(uiRoot, path).split(sep).join('/'))
    .filter((file) => file !== COLOUR_FIELD);

  it('no page or primitive builds a colour control by hand', () => {
    const offenders = files.flatMap((file) =>
      scan(readFileSync(join(uiRoot, file), 'utf8'), { inPrimitives: file.startsWith(PRIMITIVES), fileName: file })
        .map((finding) => `${file}:${finding.line} ${finding.kind}`)
        .filter((line) => !(line.slice(0, line.lastIndexOf(':')) in ALLOWED)),
    );
    expect(
      offenders,
      'use <ColourField mode="palette"> for a choice among token colours and <ColourField mode="free"> for any colour (docs/design/design-system.md#primitive-components)',
    ).toEqual([]);
  });

  it('the allowlist names files that exist and still offend, each with a reason', () => {
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(11);
      expect(files, `${file} is gone: delete its line`).toContain(file);
      expect(
        scan(readFileSync(join(uiRoot, file), 'utf8'), { inPrimitives: file.startsWith(PRIMITIVES) }).length,
        `${file} is clean: delete its line`,
      ).toBeGreaterThan(0);
    }
    expect(Object.keys(ALLOWED).length, 'the allowlist only shrinks').toBeLessThanOrEqual(0);
  });

  it('reads ColourField itself as the one place a colour input is written', () => {
    expect(kinds(readFileSync(join(uiRoot, COLOUR_FIELD), 'utf8'), { inPrimitives: true })).toEqual(['picker']);
  });

  describe('the scan sees each spelling', () => {
    it('picker: a native colour input, however the type is written', () => {
      expect(kinds('const a = <TextField label="Tint" type="color" value={v} onChange={set} />;')).toEqual(['picker']);
      expect(kinds('const a = <TextField label="Tint" type={\'color\'} value={v} onChange={set} />;')).toEqual(['picker']);
      expect(kinds('const a = <TextField label="Tint" type={`color`} value={v} onChange={set} />;')).toEqual(['picker']);
      expect(kinds('const a = <input type="color" />;')).toEqual(['picker']);
      expect(kinds("const props = { label: 'Tint', type: 'color' };")).toEqual(['picker']);
      expect(kinds('const props = { \'type\': "color" };')).toEqual(['picker']);
    });

    it('names: a list of colour names, by its label or by what its options are built from', () => {
      expect(kinds('const a = <Select label="Colour" value={v} options={opts} onChange={set} />;')).toEqual(['names']);
      expect(kinds('const a = <Select label={`Colour for ${type.name}`} value={v} options={opts} onChange={set} />;')).toEqual(['names']);
      expect(kinds('const a = <Select label="Marker color" value={v} options={opts} onChange={set} />;')).toEqual(['names']);
      expect(kinds('const a = <RadioGroup label="Speaker colour" value={v} options={opts} onChange={set} />;')).toEqual(['names']);
      expect(kinds('const a = <ToggleGroup aria-label="Colour" value={v} options={opts} onChange={set} />;')).toEqual(['names']);
      expect(kinds('const a = <Listbox label="Hue" items={HUE_NAMES.map(asItem)} />;')).toEqual(['names']);
      expect(
        kinds('const a = <Select label="Hue" value={v} options={MARK_COLOURS.map((value) => ({ value, label: names[value] }))} onChange={set} />;'),
      ).toEqual(['names']);
      expect(kinds('const a = <Select label="Hue" value={v} options={[auto, ...GUIDE_TYPE_COLOURS.map(asOption)]} onChange={set} />;')).toEqual(['names']);
      expect(kinds('const a = <Select label="Hue" value={v} options={COLOUR_OPTIONS} onChange={set} />;')).toEqual(['names']);
      expect(kinds('const a = <Select label="Hue" options={Object.entries(COLOUR_LABELS).map(asOption)} />;')).toEqual(['names']);
      expect(kinds('const a = <Select label="Hue" options={Array.from({ length: SPEAKER_COLOR_COUNT }, asOption)} />;')).toEqual(['names']);
      expect(kinds('const a = (\n  <Select label="Colour" options={opts}>\n    <span />\n  </Select>\n);')).toEqual(['names']);
    });

    it('swatch: an inline background filled from a token chosen at run time, in a page', () => {
      expect(kinds('const a = <span style={{ background: `var(--${markSwatch(type.colour)})` }} />;')).toEqual(['swatch']);
      expect(kinds('const a = <span style={{ backgroundColor: `var(--${hue})` }} />;')).toEqual(['swatch']);
      expect(kinds('const a = <span style={{ background: `var(--speaker-${n})` }} />;')).toEqual(['swatch']);
      expect(kinds('const style = { background: `color-mix(in srgb, var(--${hue}) 20%, transparent)` };')).toEqual(['swatch']);
    });

    it('reports the line', () => {
      expect(scan('const a = (\n  <div>\n    <TextField type="color" label="x" />\n  </div>\n);')).toEqual([{ kind: 'picker', line: 3 }]);
    });
  });

  describe('the scan leaves alone what is not a colour control', () => {
    it('other inputs, other lists and fixed backgrounds', () => {
      expect(kinds('const a = <TextField label="Name" type="text" value={v} onChange={set} />;')).toEqual([]);
      expect(kinds('const a = <TextField label="Note hex" mono value={v} onChange={set} />;')).toEqual([]);
      expect(kinds('const a = <Select label="Line" value={v} options={MARK_STYLES.map(asOption)} onChange={set} />;')).toEqual([]);
      expect(kinds('const a = <span style={{ background: "var(--surface-2)" }} />;')).toEqual([]);
      expect(kinds('const a = <span style={{ color: `var(--${hue}-text)` }} />;')).toEqual([]);
      expect(kinds("if (type === 'color') return null;")).toEqual([]);
      expect(kinds("type Props = { type?: 'text' | 'color' };")).toEqual([]);
    });

    it('ColourField and Swatch, the primitives a page uses for this', () => {
      expect(kinds('const a = <ColourField mode="palette" label="Colour" choices={COLOUR_CHOICES} value={v} onChange={set} />;')).toEqual([]);
      expect(kinds('const a = <ColourField mode="free" label="Note color" value={v} onChange={set} />;')).toEqual([]);
      expect(kinds('const a = <Swatch colour={markSwatch(type.colour)} size={18} />;')).toEqual([]);
    });

    it('a comment or a string that only mentions one', () => {
      expect(kinds('// <Select label="Colour"> is gone\nconst text = \'type="color"\';')).toEqual([]);
    });

    it('a primitive that fills itself from a token (the swatch rule is for pages)', () => {
      expect(kinds('const a = <span style={{ background: `var(--${colour})` }} />;', { inPrimitives: true })).toEqual([]);
      expect(kinds('const a = <TextField type="color" label="x" />;', { inPrimitives: true })).toEqual(['picker']);
    });
  });
});
