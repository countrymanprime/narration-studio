// @vitest-environment node
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faCircle, faHouse, faPlay } from '@fortawesome/free-solid-svg-icons';
import { describe, expect, test } from 'vitest';
import {
  CATALOG,
  TOOLTIP_VERBS,
  iconNamed,
  tooltipFor,
  tooltipWithShortcut,
  findSharedIconConflicts,
  findPageIconMisuse,
  type CatalogRow,
} from './icons.catalog';

// The vocabulary is data (ADR 0761, SNF-Q1): these tests are what keeps two pages from giving one action two icons, and
// one icon two meanings (icon-audit.md section 3a and rules 1, 6 and 10).

const rows = Object.entries(CATALOG as Record<string, CatalogRow>);

describe('unknown-name-falls-back', () => {
  test('a name that is not a catalogue key gets the neutral key', () => {
    expect(iconNamed('nope')).toBe('list');
    expect(iconNamed('constructor')).toBe('list');
  });

  test('a catalogue key with an icon is returned as it is', () => {
    expect(iconNamed('play')).toBe('play');
  });

  test('a text row has no icon, so its key falls back too', () => {
    expect(iconNamed('cancel')).toBe('list');
  });
});

describe('no-two-meanings-share-an-icon', () => {
  const same = (icon: IconDefinition) => icon;

  test('the catalogue has none', () => {
    expect(findSharedIconConflicts(CATALOG)).toEqual([]);
  });

  test('two rows with one icon and different meanings fail', () => {
    const conflicts = findSharedIconConflicts({
      a: { kind: 'action', icon: same(faPlay), meaning: 'play audio', tooltip: 'Play' },
      b: { kind: 'action', icon: same(faPlay), meaning: 'preview an effect', tooltip: 'Preview' },
    });
    expect(conflicts).toEqual([{ icon: 'solid:play', keys: ['a', 'b'], meanings: ['play audio', 'preview an effect'] }]);
  });

  test('an alias of the same meaning passes', () => {
    expect(
      findSharedIconConflicts({
        a: { kind: 'action', icon: faPlay, meaning: 'play audio', tooltip: 'Play' },
        b: { kind: 'action', icon: faPlay, meaning: 'play audio', tooltip: 'Play the clip' },
      }),
    ).toEqual([]);
  });

  test('the same glyph in two styles is two icons (outline off, solid on)', () => {
    const solid = CATALOG.markedDone.icon;
    const regular = CATALOG.markDone.icon;
    expect(`${solid.prefix}:${solid.iconName}`).not.toBe(`${regular.prefix}:${regular.iconName}`);
  });
});

describe('every-action-has-a-tooltip', () => {
  test.each(rows)('%s: sentence case, verb first, no trailing full stop', (key, row) => {
    expect(row.tooltip, key).toMatch(/^[A-Z][a-z]+( |$)/);
    expect(TOOLTIP_VERBS as readonly string[], `${key}: "${row.tooltip.split(' ')[0]}" is not a listed verb`).toContain(row.tooltip.split(' ')[0]);
    expect(row.tooltip, key).not.toMatch(/[.…]$|\.\.\.$/);
    expect(row.tooltip, key).not.toMatch(/\(/);
  });

  test('a row with a shortcut lists it in parentheses at the end', () => {
    expect(tooltipWithShortcut({ kind: 'action', icon: faPlay, meaning: 'm', tooltip: 'Play', shortcut: 'Space' })).toBe('Play (Space)');
    expect(tooltipFor('undo')).toBe('Undo (Ctrl+Z)');
    expect(tooltipFor('close')).toBe('Close');
  });

  test('a shortcut is not already written into the tooltip', () => {
    for (const [key, row] of rows) expect(row.tooltip, key).not.toContain('Ctrl+');
  });
});

describe('nav-icons-are-not-actions', () => {
  test('the page icons are kind page, and nothing else uses them as an action', () => {
    expect(findPageIconMisuse(CATALOG)).toEqual([]);
    const pages = rows.filter(([, row]) => row.kind === 'page').map(([key]) => key);
    expect(pages).toEqual(expect.arrayContaining(['home', 'calendar', 'script', 'wave', 'gauge', 'gear', 'book', 'microphone', 'scissors']));
  });

  test('an action that borrows a page icon fails; a link to that page passes', () => {
    const page: CatalogRow = { kind: 'page', icon: faHouse, meaning: 'page:production', tooltip: 'Open Production' };
    expect(findPageIconMisuse({ home: page, reuse: { kind: 'action', icon: faHouse, meaning: 'start over', tooltip: 'Start over' } })).toEqual([
      { key: 'reuse', icon: 'solid:house', page: 'home' },
    ]);
    expect(
      findPageIconMisuse({ home: page, openProduction: { kind: 'pageLink', icon: faHouse, meaning: 'page:production', tooltip: 'Open Production' } }),
    ).toEqual([]);
    // A link must open the page whose icon it wears.
    expect(findPageIconMisuse({ home: page, openElsewhere: { kind: 'pageLink', icon: faHouse, meaning: 'page:other', tooltip: 'Open it' } })).toEqual([
      { key: 'openElsewhere', icon: 'solid:house', page: 'home' },
    ]);
  });

  test('a page row is not reused for a different page', () => {
    expect(
      findPageIconMisuse({
        a: { kind: 'page', icon: faCircle, meaning: 'page:a', tooltip: 'Open A' },
        b: { kind: 'page', icon: faCircle, meaning: 'page:b', tooltip: 'Open B' },
      }),
    ).toEqual([{ key: 'b', icon: 'solid:circle', page: 'a' }]);
  });
});

describe('the catalogue follows the audit', () => {
  test('a text row has no icon and every other row has one', () => {
    for (const [key, row] of rows) expect(row.icon === null, key).toBe(row.kind === 'text');
  });

  test('a key is an action name, not a glyph name', () => {
    for (const key of Object.keys(CATALOG)) expect(key, key).not.toMatch(/^fa[A-Z]/);
  });
});

describe('the Script, Story Bible and extraction rows (SN-B60)', () => {
  const keys = [
    'bookmark',
    'bookmarks',
    'textSettings',
    'openMenu',
    'incomingRelationship',
    'showExample',
    'hideExample',
    'recordHere',
    'goToChapter',
    'addWord',
    'addMark',
    'addRelationship',
    'editBookmark',
    'editMessage',
    'editSuggestion',
    'deleteBookmark',
    'deleteNote',
    'deleteMessage',
    'deleteEntry',
    'copyQuery',
    'copyPrompt',
    'copyExample',
    'recordInBooth',
    'addToStoryBible',
    'accept',
    'saveAndAccept',
    'markReviewed',
    'reject',
    'dismiss',
    'cancelEdit',
    'cancelDownload',
    'sourceAuto',
    'sourceRules',
    'sourceDictionary',
    'sourceBookNlp',
    'sourceOnline',
    'sourceLocalModel',
    'sourceManual',
    'sourceImported',
    'sourceGliner',
    'scan',
    'importFromFile',
  ];

  test.each(keys)('%s has a row', (key) => {
    expect(Object.hasOwn(CATALOG, key)).toBe(true);
  });

  test('the new rows share no icon between meanings and wear no page icon as an action', () => {
    expect(findSharedIconConflicts(CATALOG)).toEqual([]);
    expect(findPageIconMisuse(CATALOG)).toEqual([]);
  });
});
