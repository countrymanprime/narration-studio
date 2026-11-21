import type { ReactNode } from 'react';
import type { ChapterDoc } from '../model';
import type { DrawerTab } from './drawerTabs';

/** What a section sees: the document and the few things the page lends the drawer. */
export interface DrawerContext {
  doc: ChapterDoc;
  chapterId: string;
}

export interface DrawerSection {
  tab: DrawerTab;
  /** Lower comes first; two sections with one order keep the order they registered in. */
  order: number;
  /** The section's accessible name. */
  label: string;
  render: (context: DrawerContext) => ReactNode;
}

const sections: DrawerSection[] = [];
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
  version += 1;
  for (const on of listeners) on();
};

/** For the Drawer: it draws again when a section is added, replaced or removed, so a page that re-registers after its own render is not one render behind. */
export function subscribeSections(on: () => void): () => void {
  listeners.add(on);
  return () => listeners.delete(on);
}
export const sectionsVersion = (): number => version;

/** Adds a section to its tab of the Editing drawer and returns the function that removes it. */
export function registerDrawerSection(section: DrawerSection): () => void {
  const entry: DrawerSection = { ...section };
  const at = sections.findIndex((s) => s.order > entry.order);
  sections.splice(at < 0 ? sections.length : at, 0, entry);
  changed();
  return () => {
    const i = sections.indexOf(entry);
    if (i >= 0) sections.splice(i, 1);
    changed();
  };
}

/** What a tab draws, in order. A section that throws is dropped and logged; the rest still show. */
export function drawSections(tab: DrawerTab, context: DrawerContext): Array<{ section: DrawerSection; node: ReactNode }> {
  const drawn: Array<{ section: DrawerSection; node: ReactNode }> = [];
  for (const section of sections.filter((s) => s.tab === tab)) {
    try {
      drawn.push({ section, node: section.render(context) });
    } catch (error) {
      console.error(`The drawer section "${section.label}" failed and was left out.`, error);
    }
  }
  return drawn;
}
