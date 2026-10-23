import { iconNamed, type IconName } from '../../../../icons.catalog';

// The host names a source's label (the list the page passes in) but not an icon, so the UI maps an id to one, as the pronunciation
// sources do (storybible/source/sourceIcons.ts). A source this table does not know draws the neutral icon: a new source needs a row
// here for a better one, and no change to the row.
const SOURCE_ICONS: Readonly<Record<string, IconName>> = {
  rules: 'sourceRules',
  imported: 'sourceImported',
  'local-model': 'sourceLocalModel',
  gliner: 'sourceGliner',
  booknlp: 'sourceBookNlp',
};

export const extractionSourceIcon = (id: string): IconName => iconNamed(Object.hasOwn(SOURCE_ICONS, id) ? SOURCE_ICONS[id]! : '');
