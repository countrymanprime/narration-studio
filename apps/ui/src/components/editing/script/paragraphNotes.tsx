import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { EntityColour } from '../../../kinds/entityColour';
import type { narratorMarkStyle } from '../../../kinds/narratorMark';
import { buildLayerIndex, paragraphLayers, type LayerIndex, type LayerSources, type PhraseLayer } from '../../script/page/reader/layers';

type MarkColour = Parameters<typeof narratorMarkStyle>[0];
type MarkStyle = Parameters<typeof narratorMarkStyle>[1];

/** What the Script page's data lays over a word of the text: the Story Bible name it belongs to, and the narrator's mark on it. */
export interface WordNote {
  entity?: EntityColour;
  mark?: { colour: MarkColour; style: MarkStyle; name: string };
}

/** A note the narrator left on a line (a mark of a type that does not ask, with text): shown under the line as "name: text". */
export interface BoothNote {
  id: string;
  name: string;
  text: string;
}

export interface ParagraphNotes {
  /** The speaker behind a quote unit's cue. */
  phrase: (cue: string) => PhraseLayer | undefined;
  /** The names and marks a word `[start, end)` of the paragraph's text sits in; undefined for a plain word. */
  at: (start: number, end: number) => WordNote | undefined;
  notes: readonly BoothNote[];
}

const NONE: ParagraphNotes = { phrase: () => undefined, at: () => undefined, notes: [] };

const overlaps = (a: { start: number; end: number }, start: number, end: number): boolean => a.start < end && a.end > start;

/** What one paragraph's text carries, from the same layers the Script reader draws (names, marks, quotes with their speakers). */
export function notesFor(index: LayerIndex, paragraph: { id: string; chapterId: string; text: string }): ParagraphNotes {
  const layers = paragraphLayers(index, paragraph);
  const phrases = new Map(layers.flatMap((l) => (l.kind === 'phrase' ? [[l.cueId, l] as const] : [])));
  const names = layers.flatMap((l) => (l.kind === 'name' ? [l] : []));
  const marks = layers.flatMap((l) => (l.kind === 'mark' ? [{ ...l, note: { colour: l.colour, style: l.style, name: l.name } }] : []));
  const mine = new Map((index.marksBy.get(paragraph.id) ?? []).map((m) => [m.id, m]));
  const notes = marks.flatMap((l) => {
    const text = mine.get(l.id)?.text.trim();
    return l.note && text ? [{ id: l.id, name: l.name, text }] : [];
  });
  const cache = new Map<string, WordNote | undefined>();
  return {
    phrase: (cue) => phrases.get(cue),
    notes,
    at: (start, end) => {
      const key = `${start}:${end}`;
      if (cache.has(key)) return cache.get(key);
      const name = names.find((n) => overlaps(n, start, end));
      const mark = marks.find((m) => overlaps(m, start, end));
      const found: WordNote | undefined = name || mark ? { ...(name ? { entity: name.colour } : {}), ...(mark ? { mark: mark.note } : {}) } : undefined;
      cache.set(key, found);
      return found;
    },
  };
}

const NotesContext = createContext<{ index: LayerIndex | null; chapterId: string }>({ index: null, chapterId: '' });

/** Hands the paragraphs of the page the Story Bible, marks and quotes the Script page has read. */
export function ScriptNotesProvider({ sources, chapterId, children }: { sources: LayerSources; chapterId: string; children: ReactNode }) {
  const index = useMemo(() => buildLayerIndex(sources), [sources]);
  const value = useMemo(() => ({ index, chapterId }), [index, chapterId]);
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

/** The notes of one paragraph; none where no provider is mounted (a story or test with no Story Bible). */
export function useParagraphNotes(id: string, text: string): ParagraphNotes {
  const { index, chapterId } = useContext(NotesContext);
  return useMemo(() => (index ? notesFor(index, { id, chapterId, text }) : NONE), [index, chapterId, id, text]);
}
