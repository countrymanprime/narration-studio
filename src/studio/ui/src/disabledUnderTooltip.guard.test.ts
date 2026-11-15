// @vitest-environment node
// A `Button` or `IconButton` that is natively `disabled` inside a `TooltipTarget` says why only to a mouse: a disabled button is not in the Tab order and takes no focus, so a
// keyboard user never reaches its tooltip and a screen reader reads a dead button with no reason (#3276: "no button that does nothing or looks like it does nothing"). A button
// that is off says why with `disabledReason`, which keeps it focusable (`aria-disabled`) and shows the reason on focus. This lists the buttons still written the old way; the list
// only shrinks: a site moves to `disabledReason` and leaves it, and a new one is not added.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const COMPONENTS = join(__dirname, 'components');

/**
 * Sites still natively disabled under a tooltip, with how many each file has. Each is a different case to move: the Audacity unlink and the Relationships remove and add keep
 * their name as the tooltip and are only off while another change runs (they need the busy sentence as a reason), and the Compare export's tooltip is also the hint while it is on.
 */
const DEBT: Record<string, number> = {
  'engine/AudacityLinkCard.tsx': 1,
  'proof/CompareRun.tsx': 1,
  'storybible/Relationships.tsx': 2,
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.(test|stories)\./.test(name) ? [path] : [];
  });
}

const tagOf = (node: ts.Node): string | undefined =>
  ts.isJsxElement(node) ? node.openingElement.tagName.getText() : ts.isJsxSelfClosingElement(node) ? node.tagName.getText() : undefined;

function disabledUnderTooltip(path: string): number {
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = 0;
  const visit = (node: ts.Node): void => {
    const tag = tagOf(node);
    if (tag === 'Button' || tag === 'IconButton') {
      const opening = ts.isJsxElement(node) ? node.openingElement : (node as ts.JsxSelfClosingElement);
      const disabled = opening.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === 'disabled');
      let parent: ts.Node | undefined = node.parent;
      while (parent && tagOf(parent) === undefined) parent = parent.parent;
      if (disabled && parent && tagOf(parent) === 'TooltipTarget') found += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('a button that is off says why with disabledReason, not a native disabled under a tooltip', () => {
  const counts = new Map<string, number>();
  for (const path of sources(COMPONENTS)) {
    const found = disabledUnderTooltip(path);
    if (found > 0) counts.set(relative(COMPONENTS, path).split(sep).join('/'), found);
  }

  it('has no site beyond the listed debt', () => {
    const over = [...counts].filter(([file, n]) => n > (DEBT[file] ?? 0)).map(([file, n]) => `${file}: ${n} (allowed ${DEBT[file] ?? 0})`);
    expect(over, 'use `disabledReason` on the Button or IconButton, which stays in the Tab order and shows the reason on focus').toEqual([]);
  });

  it('lists nothing that has been fixed', () => {
    const stale = Object.entries(DEBT)
      .filter(([file, n]) => (counts.get(file) ?? 0) < n)
      .map(([file, n]) => `${file}: ${counts.get(file) ?? 0} found, ${n} listed`);
    expect(stale, 'a site that now uses `disabledReason` leaves the list').toEqual([]);
  });
});
