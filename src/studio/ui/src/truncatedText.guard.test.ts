// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, test } from 'vitest';

// Class guard for #3274 (the owner could not read a track's name in a narrow dropdown and "there is no tooltip"): an element that clips its text
// with an ellipsis (`truncate`, `line-clamp-*`, `text-ellipsis`) must give the full text another way, or the narrator cannot read what the box cut
// off. That is a `title` on the element or on an ancestor, or a `TooltipTarget` / `Tooltip` around it. An `aria-label` alone does not count: it is
// not seen. A `<select>` draws its own title (Select.tsx), so a clip on a `Select` is its own.
//
// The measured debt is below, `file#N` for the Nth clipping element of a file that has none of these. It only shrinks: fixing an element deletes its
// line, and a new clip with no way to read the rest fails here. #3380 owns the debt.

const SRC = join(__dirname);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx$/.test(entry.name) && !/\.(test|stories)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

const CLIPS = /(^|[\s"'`])(truncate|text-ellipsis|line-clamp-\d+)(?=$|[\s"'`])/;
const TOOLTIP_TAGS = new Set(['TooltipTarget', 'Tooltip']);

type Tag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
const tagOf = (node: ts.Node): Tag | undefined => (ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined);

function hasTitle(tag: Tag): boolean {
  return tag.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === 'title');
}

/** The clipping elements of one source text that give no other way to read the whole text, in source order. */
export function unreadableClips(source: string, fileName = 'probe.tsx'): { line: number; text: string }[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: { line: number; text: string }[] = [];
  const visit = (node: ts.Node, covered: boolean): void => {
    const tag = tagOf(node);
    let next = covered;
    if (tag) {
      const name = tag.tagName.getText(file);
      const className = tag.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(file) === 'className');
      const clips = className !== undefined && CLIPS.test(className.getText(file));
      if (clips && !covered && !hasTitle(tag) && name !== 'Select')
        found.push({ line: file.getLineAndCharacterOfPosition(tag.getStart(file)).line + 1, text: tag.getText(file).slice(0, 80) });
      // What an element covers: itself and everything inside it, when it is a tooltip or carries a title.
      next = covered || TOOLTIP_TAGS.has(name) || hasTitle(tag);
    }
    ts.forEachChild(node, (child) => visit(child, next));
  };
  visit(file, false);
  return found;
}

describe('the scan itself', () => {
  it.each([
    '<span className="truncate">{name}</span>',
    '<p className="line-clamp-2 text-sm">{text}</p>',
    '<span className={`min-w-0 flex-1 text-ellipsis ${x}`}>{name}</span>',
  ])('sees %s', (code) => expect(unreadableClips(code)).toHaveLength(1));
  it.each([
    '<span className="truncate" title={name}>{name}</span>',
    '<TooltipTarget text={name}><span className="truncate">{name}</span></TooltipTarget>',
    '<button title={name}><span className="truncate">{name}</span></button>',
    '<Select className="truncate" value={v} onChange={f} options={o} label="x" />',
    '<span className="no-truncate-here">x</span>',
    '<span className="min-w-0">x</span>',
  ])('leaves %s alone', (code) => expect(unreadableClips(code)).toEqual([]));
});

// The debt measured when the guard was added: elements that clip their text and give no way to read the rest. Fix one and delete its line.
const DEBT = new Set<string>([
  'components/booth/frame/LevelsMenu.tsx#1',
  'components/booth/pickups/PickupSession.tsx#1',
  'components/booth/resume/ResumeOffer.tsx#1',
  'components/booth/suspected/SuspectedLines.tsx#1',
  'components/booth/voices/VoiceControl.tsx#1',
  'components/booth/voices/VoiceControl.tsx#2',
  'components/editing/bar/SelectionBar.tsx#1',
  'components/layout/TimerChip.tsx#1',
  'components/primitives/Field.tsx#1',
  'components/primitives/Menu.tsx#1',
  'components/primitives/StatTile.tsx#1',
  'components/primitives/TitleSubtitle.tsx#1',
  'components/primitives/TitleSubtitle.tsx#2',
  'components/primitives/TitleSubtitle.tsx#3',
  'components/production/ImportReview.tsx#1',
  'components/proof/ProofChapterPage.tsx#1',
  'components/proof/inspector/FindingThread.tsx#1',
  'components/script/bookmarks/ui/BookmarkEditor.tsx#1',
  'components/script/page/rail/bible/EntryCard.tsx#1',
  'components/script/page/reader/Reader.tsx#1',
  'components/storybible/EntryTable.tsx#1',
  'components/storybible/EntryTable.tsx#2',
  'components/storybible/Relationships.tsx#1',
  'components/storybible/VoiceReferencesSection.tsx#1',
  'components/storybible/suggested/panel/LooseSuggestionRows.tsx#1',
  'components/storybible/suggested/panel/ScanStatus.tsx#1',
]);

describe('text that is cut off can be read in full', () => {
  const found = new Map<string, number>();
  const keys: string[] = [];
  for (const path of sources(SRC)) {
    const rel = relative(SRC, path).split(sep).join('/');
    unreadableClips(readFileSync(path, 'utf8'), rel).forEach(() => {
      const nth = (found.get(rel) ?? 0) + 1;
      found.set(rel, nth);
      keys.push(`${rel}#${nth}`);
    });
  }
  test('has no clipped text without a title or a tooltip beyond the listed debt', () => {
    expect(keys.filter((key) => !DEBT.has(key))).toEqual([]);
  });
  test('the debt list only holds clips that still exist', () => {
    expect([...DEBT].filter((key) => !keys.includes(key))).toEqual([]);
  });
});
