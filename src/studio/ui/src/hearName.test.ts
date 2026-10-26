// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { CATALOG, hearNameAction } from './icons.catalog';

// Owner (2026-10-26): the Story Bible's list spoke a name with the speaker and the open entry with the Proof page's wave. Every
// button that speaks a name or a word takes its icon from `hearNameAction`, so the places cannot drift apart again. A button counts
// as one when its press plays a name (`playPreview`, `hearReference`, `onHear`, a row's `hear.onPress`) or its label says it plays a
// pronunciation or a preview; it must ask `hearNameAction(...)` for its `action` and draw no glyph of its own.

const SPEAKS_A_NAME = /\b(playPreview|hearReference|onHear|hear\.onPress)\b/;
const NAMED_AS_HEARING = /pronunciation|^(Play|Pause|Stop|Hear) preview$/i;

type Offence = { file: string; line: number; why: string };

function attribute(element: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return element.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name);
}

// Every piece of literal text an attribute can produce: string literals and the literal parts of template strings.
function texts(node: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

function scan(source: string, file = 'probe.tsx'): Offence[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const offences: Offence[] = [];
  const visit = (node: ts.Node) => {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined;
    if (opening && opening.tagName.getText() === 'IconButton') {
      const label = attribute(opening, 'label');
      const speaks =
        opening.attributes.properties.some((p) => ts.isJsxAttribute(p) && p.initializer !== undefined && SPEAKS_A_NAME.test(p.initializer.getText())) ||
        (label?.initializer !== undefined && texts(label.initializer).some((t) => NAMED_AS_HEARING.test(t.trim())));
      if (speaks) {
        const line = sf.getLineAndCharacterOfPosition(opening.getStart()).line + 1;
        const action = attribute(opening, 'action')?.initializer;
        const asks =
          action !== undefined &&
          ts.isJsxExpression(action) &&
          action.expression !== undefined &&
          ts.isCallExpression(action.expression) &&
          action.expression.expression.getText() === 'hearNameAction';
        if (!asks) offences.push({ file, line, why: 'its action is not hearNameAction(...)' });
        if (ts.isJsxElement(node) && node.children.some((child) => !ts.isJsxText(child) || child.text.trim() !== ''))
          offences.push({ file, line, why: 'it draws its own icon' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return offences;
}

const uiRoot = join(__dirname, '..');
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) && !/\.(test|stories)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

describe('hearing a name', () => {
  test('is the speaker, and stop while it plays', () => {
    expect(hearNameAction()).toBe('hear');
    expect(hearNameAction(true)).toBe('stop');
    expect(CATALOG.hear.icon.iconName).toBe('volume-high');
  });

  test('every button that speaks a name asks hearNameAction for its icon', () => {
    const offences = sourceFiles(join(uiRoot, 'src', 'components')).flatMap((path) =>
      scan(readFileSync(path, 'utf8'), relative(uiRoot, path).split(sep).join('/')),
    );
    expect(offences).toEqual([]);
  });

  test('the scan finds the ways a button can go its own way', () => {
    expect(scan('<IconButton label="Play preview" onClick={() => void playPreview()}><FontAwesomeIcon icon={faWaveSquare} /></IconButton>')).toEqual([
      { file: 'probe.tsx', line: 1, why: 'its action is not hearNameAction(...)' },
      { file: 'probe.tsx', line: 1, why: 'it draws its own icon' },
    ]);
    expect(scan('<IconButton action="hear" onClick={() => hearReference(word)} />')).toHaveLength(1);
    expect(scan("<IconButton action={playing ? 'stop' : 'hear'} label={`Hear ${name}`} onClick={hear.onPress} />")).toHaveLength(1);
    expect(scan('<IconButton label={playing ? "Pause alias pronunciation" : "Play alias pronunciation"} action="play" onClick={go} />')).toHaveLength(1);
    expect(scan('<IconButton action={hearNameAction(playing)} label="Play preview" onClick={() => void playPreview()} />')).toEqual([]);
    // Playing a recording (a take, the original around a line) is not hearing a name.
    expect(scan('<IconButton action="play" label="Hear the original in context" onClick={playOriginal} />')).toEqual([]);
  });
});
