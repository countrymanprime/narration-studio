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

/** Adds a section to its tab of the Editing drawer and returns the function that removes it. */
export function registerDrawerSection(section: DrawerSection): () => void {
  const entry: DrawerSection = { ...section };
  const at = sections.findIndex((s) => s.order > entry.order);
  sections.splice(at < 0 ? sections.length : at, 0, entry);
  return () => {
    const i = sections.indexOf(entry);
    if (i >= 0) sections.splice(i, 1);
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
