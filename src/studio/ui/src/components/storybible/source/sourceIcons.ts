import { iconNamed, type IconName } from '../../../icons.catalog';

// The host reports no icon for a source (contracts/pronunciationSources.ts), so the UI maps an id to one. A source this table
// does not know draws the neutral icon: a new source needs a row here for a better one, and no change to the tag or the menu.
const SOURCE_ICONS: Readonly<Record<string, IconName>> = {
  cmu: 'sourceDictionary',
  wiktextract: 'sourceDictionary',
  espeak: 'sourceRules',
  merriam_webster: 'sourceOnline',
  manual: 'sourceManual',
};

export const sourceIcon = (id: string): IconName => iconNamed(Object.hasOwn(SOURCE_ICONS, id) ? SOURCE_ICONS[id]! : '');
