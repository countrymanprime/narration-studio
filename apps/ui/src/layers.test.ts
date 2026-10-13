import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = import.meta.dirname;
const css = readFileSync(join(here, 'styles.css'), 'utf8');
const layer = (name: string): number => {
  const match = css.match(new RegExp(`--z-${name}:\\s*(\\d+)`));
  if (!match) throw new Error(`--z-${name} is not defined in styles.css`);
  return Number(match[1]);
};

// The one layer scale (styles.css). Lowest first. Page panels sit under the navigation rail, so the rail stays clickable with one open;
// everything the app draws in a portal sits above the rail, the modal layers above their popups' anchors, and the dialog above every menu.
const ORDER = ['panel-scrim', 'panel', 'nav', 'slide-over-scrim', 'slide-over', 'toast', 'popover', 'dialog', 'dialog-popover', 'tooltip'] as const;

describe('the layer scale', () => {
  it('is strictly increasing in the documented order', () => {
    const values = ORDER.map(layer);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps a page panel (a Script drawer) and its scrim under the navigation rail', () => {
    expect(layer('panel-scrim')).toBeLessThan(layer('nav'));
    expect(layer('panel')).toBeLessThan(layer('nav'));
  });

  it('keeps every menu, context menu and popover under the app dialogs, and the dialog popover above them', () => {
    expect(layer('popover')).toBeLessThan(layer('dialog'));
    expect(layer('dialog')).toBeLessThan(layer('dialog-popover'));
  });

  it('has no component pick its own z-index number: layers come from the tokens', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx$/.test(name) && !/\.(test|stories)\.tsx$/.test(name)) {
          const source = readFileSync(path, 'utf8');
          // A stacking tweak between siblings (`z-[1]`, `z-10`, `z-[5]`) is local; a layer of the scale is 19 or more.
          for (const match of source.matchAll(/\bz-\[?(\d+)\]?/g)) if (Number(match[1]) >= 19) offenders.push(`${path.replace(here, 'src')}: z-${match[1]}`);
        }
      }
    };
    walk(join(here, 'components'));
    expect(offenders).toEqual([]);
  });
});
