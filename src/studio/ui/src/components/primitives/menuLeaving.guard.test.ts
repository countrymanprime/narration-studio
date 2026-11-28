import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// A menu that has been closed stays drawn for its exit (120 ms), with its highlighted item still focused: a Space or an Enter pressed inside the exit presses
// that item (#4125 the chapter list, #4183 the Booth's right-click menu and the Menu primitive). Every component that draws a Base UI menu keeps its items
// from taking a press then, through `useLeaving`: each menu root tells the hook when it opens and closes, each submenu root also when its exit ends, and every
// item (a trigger of a submenu too) is `disabled` by it. A new menu primitive that does not fails here, so the next one starts from the guard and not from the bug.
const SRC = join(__dirname, '..', '..');
const isSource = (file: string) => /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file);
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : isSource(path) ? [path] : [];
  });
const sources = walk(SRC).map((path) => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }));

const DRAWS_A_MENU = /from '@base-ui\/react\/(menu|context-menu|menubar)'/;

/** The text without comments, so a word in a comment never satisfies a rule: line comments, block comments and `{/* … *\/}` in JSX. */
const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** The text of each opening tag `<Name …>`: from `<Name` to the first `>` outside braces and not part of `=>`. A linear scan (a regular expression for nested braces backtracks badly). */
function tagsOf(text: string, name: RegExp): string[] {
  const tags: string[] = [];
  for (let at = text.indexOf('<Base'); at >= 0; at = text.indexOf('<Base', at + 1)) {
    const head = /^<Base(?:Context)?Menu\.\w+/.exec(text.slice(at))?.[0];
    if (!head || !name.test(head)) continue;
    let depth = 0;
    let end = at;
    for (; end < text.length; end++) {
      const char = text[end];
      if (char === '{') depth++;
      else if (char === '}') depth--;
      else if (char === '>' && depth === 0 && text[end - 1] !== '=') break;
    }
    tags.push(text.slice(at, end + 1));
  }
  return tags;
}

const ITEMS = /\.(Item|RadioItem|CheckboxItem|LinkItem|SubmenuTrigger)$/;
const ROOTS = /\.(Root|SubmenuRoot)$/;
const SUBMENU_ROOT = /\.SubmenuRoot$/;
// An item is off for good (a bare `disabled`) or by the hook (`disabled={… leaving …}`, or `gone` for a submenu's trigger, which its own submenu also switches off).
const OFF_BY_HOOK = /\sdisabled=\{[^}]*\b(leaving|gone)\b[^}]*\}|\sdisabled(?=[\s/>])/;
// The root's `onOpenChange` is the hook's `track`, or a function that calls it.
const TRACKS = /\sonOpenChange=\{(?:track\w*\}|[^]*?\btrack\w*\()/;
const SETTLES = /\sonOpenChangeComplete=\{settle\w*\}/;

/** What a component that draws a Base UI menu leaves unguarded. */
function unguarded(text: string): string[] {
  const code = withoutComments(text);
  const problems: string[] = [];
  if (!/from '\.\/useLeaving'/.test(code) || !/useLeaving\(\)/.test(code)) problems.push('does not use useLeaving');
  for (const tag of tagsOf(code, ITEMS)) if (!OFF_BY_HOOK.test(tag)) problems.push(`an item is not disabled while it leaves: ${tag.slice(0, 60)}`);
  for (const tag of tagsOf(code, ROOTS)) if (!TRACKS.test(tag)) problems.push(`a root does not track its exit: ${tag.slice(0, 60)}`);
  for (const tag of tagsOf(code, SUBMENU_ROOT)) if (!SETTLES.test(tag)) problems.push(`a submenu root does not settle: ${tag.slice(0, 60)}`);
  return problems;
}

describe('every Base UI menu keeps its items from taking a press while it leaves', () => {
  const menus = sources.filter((source) => DRAWS_A_MENU.test(source.text));

  it('finds the menu components, so the guard cannot go quiet', () => {
    expect(menus.map((menu) => menu.path).sort()).toEqual([
      'components/primitives/ChapterStepper.tsx',
      'components/primitives/ContextMenu.tsx',
      'components/primitives/Menu.tsx',
    ]);
    // Each draws roots and items the scan can see.
    for (const menu of menus) {
      const code = withoutComments(menu.text);
      expect(tagsOf(code, ROOTS).length, menu.path).toBeGreaterThan(0);
      expect(tagsOf(code, ITEMS).length, menu.path).toBeGreaterThan(0);
    }
    expect(tagsOf(withoutComments(sources.find((source) => source.path.endsWith('ContextMenu.tsx'))!.text), SUBMENU_ROOT).length).toBeGreaterThan(0);
  });

  it.each(menus.map((menu) => [menu.path, menu.text]))('%s guards every item and every root', (_path, text) => {
    expect(unguarded(text!)).toEqual([]);
  });

  // The guard is itself checked: a component with one of these taken out fails it.
  describe('fails a menu component that', () => {
    const good = `import { Menu as BaseMenu } from '@base-ui/react/menu';
import { useLeaving } from './useLeaving';
function M() {
  const [leaving, track, settle] = useLeaving();
  return (
    <BaseMenu.Root onOpenChange={(open) => { track(open); }}>
      <BaseMenu.Item onClick={f} disabled={leaving} className="a">x</BaseMenu.Item>
      <BaseMenu.SubmenuRoot onOpenChange={track} onOpenChangeComplete={settle}>
        <BaseMenu.SubmenuTrigger disabled={off || leaving}>y</BaseMenu.SubmenuTrigger>
      </BaseMenu.SubmenuRoot>
    </BaseMenu.Root>
  );
}`;
    it('is guarded as written', () => expect(unguarded(good)).toEqual([]));
    it.each([
      ['never imports the hook', good.replace("import { useLeaving } from './useLeaving';\n", '')],
      [
        'has one item that is not disabled by it',
        good.replace('<BaseMenu.Item onClick={f} disabled={leaving} className="a">', '<BaseMenu.Item onClick={f} className="a">'),
      ],
      ['has one item disabled by something else', good.replace('disabled={leaving} className="a"', 'disabled={other} className="a"')],
      ['has a submenu trigger that is not disabled by it', good.replace('disabled={off || leaving}', 'disabled={off}')],
      ['has a root that does not track its exit', good.replace('onOpenChange={(open) => { track(open); }}', 'onOpenChange={(open) => { log(open); }}')],
      [
        'has a root that only mentions tracking in a comment',
        good.replace('onOpenChange={(open) => { track(open); }}', 'onOpenChange={(open) => { /* track(open) */ log(open); }}'),
      ],
      [
        'has a submenu root that is not tracked',
        good.replace('<BaseMenu.SubmenuRoot onOpenChange={track} onOpenChangeComplete={settle}>', '<BaseMenu.SubmenuRoot onOpenChangeComplete={settle}>'),
      ],
      ['has a submenu root that never settles', good.replace(' onOpenChangeComplete={settle}', '')],
      [
        'only mentions the rule in a comment',
        good.replace('disabled={leaving} className="a"', 'className="a"').replace('x</BaseMenu.Item>', '{/* disabled={leaving} */}x</BaseMenu.Item>'),
      ],
    ])('%s', (_name, text) => expect(unguarded(text)).not.toEqual([]));
  });
});
