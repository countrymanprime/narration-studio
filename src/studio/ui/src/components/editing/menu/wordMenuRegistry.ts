import type { ContextMenuItem } from '../../primitives/ContextMenu';
import type { ChapterDoc, SelSummary } from '../model';

/** What a section sees when the menu opens: the words the menu acts on and the few actions the page lends it. */
export interface WordMenuSelection {
  doc: ChapterDoc;
  /** The keys the menu acts on, in the order of the text. */
  keys: string[];
  summary: SelSummary;
  /** Plays the seconds from `start` to `end` of the chapter as it stands now. */
  play: (start: number, end: number) => void;
  /** Says something in a toast. */
  notify: (text: string) => void;
}

export interface WordMenuSection {
  /** Lower comes first; two sections with one order keep the order they registered in. */
  order: number;
  items: (selection: WordMenuSelection) => ContextMenuItem[];
}

export interface WordMenu {
  /** "3 words selected". */
  heading: string;
  /** The bands that have items, in order, each item labelled with its band (`group`), so the menu draws a heading and a rule per band. */
  groups: ContextMenuItem[][];
}

/**
 * The menu's bands, by section order: what plays the words, what changes them, what marks them, the takes, then the rest (copy). The first
 * band is headed by the word count; the last has no heading. Seventeen rows in one run with no rule were a wall (alignment audit R3ED-5,
 * XED-21). A section joins the band its `order` falls in.
 */
const BANDS: { below: number; label: (heading: string) => string | undefined }[] = [
  { below: 50, label: (heading) => heading },
  { below: 200, label: () => 'Edit' },
  { below: 300, label: () => 'Mark' },
  { below: 400, label: () => 'Takes' },
  { below: Infinity, label: () => undefined },
];

const sections: WordMenuSection[] = [];

/** Adds a section to the Editing page's one word menu and returns the function that removes it. */
export function registerWordMenuSection(section: WordMenuSection): () => void {
  const entry: WordMenuSection = { order: section.order, items: (selection) => section.items(selection) };
  const at = sections.findIndex((s) => s.order > entry.order);
  sections.splice(at < 0 ? sections.length : at, 0, entry);
  return () => {
    const i = sections.indexOf(entry);
    if (i >= 0) sections.splice(i, 1);
  };
}

const headingFor = (count: number): string => `${count} ${count === 1 ? 'word' : 'words'} selected`;

/** The heading and the non-empty sections for a selection. A section that throws is dropped and logged; the rest still show. */
export function buildWordMenu(selection: WordMenuSelection): WordMenu {
  const heading = headingFor(selection.keys.length);
  const bands = BANDS.map(() => [] as ContextMenuItem[]);
  for (const section of [...sections]) {
    try {
      const items = section.items(selection);
      const band = BANDS.findIndex((b) => section.order < b.below);
      const group = BANDS[band]!.label(heading);
      bands[band]!.push(...items.map((item) => (item.group === undefined && group !== undefined ? { ...item, group } : item)));
    } catch (error) {
      console.error('A word menu section failed and was left out.', error);
    }
  }
  return { heading, groups: bands.filter((band) => band.length > 0) };
}
