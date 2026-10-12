// The layers a paragraph draws over its own text: the narrator's marks, flagged words, Story Bible names, the speaker of each
// quoted phrase and the matches of Find. They only wrap pieces of the text, so the paragraph's text is the same with or
// without them. The pieces come from one interval compositor in the style of the old reader's `manuscript/annotations.ts`
// (a layer boundary splits a piece, the shorter layer is the inner one and owns the click); that file is the Booth's until its swap
// (SNO-10) deletes it, so the idea is copied here rather than imported.

import type { ManuscriptParagraph } from '../../../../api/contracts/manuscript';
import type { Mark, MarkColour, MarkStyle, MarkType } from '../../../../api/contracts/marks';
import type { ScriptWord } from '../../../../api/contracts/scriptPrep';
import type { GuideDialogueCue, GuideEntity } from '../../../../api/contracts/storyBible';
import { speakerColorIndex } from '../../../primitives/speakerColor';
import { mentionsIn, phrasesOf, type Phrase } from '../data/script.selectors';

type Span = { start: number; end: number };

type MarkLayer = Span & {
  kind: 'mark';
  id: string;
  colour: MarkColour;
  style: MarkStyle;
  /** A question: its end carries a query sign. */
  ask: boolean;
  /** A note with text: its end carries a note sign. */
  note: boolean;
  name: string;
};
type WordLayer = Span & { kind: 'word'; key: string; flagId: string; status: ScriptWord['status'] };
type NameLayer = Span & { kind: 'name'; entryId: string; entryKind: string };
type FindLayer = Span & { kind: 'find'; current: boolean };
export type PhraseLayer = Span & {
  kind: 'phrase';
  cueId: string;
  speakerId: string | null;
  /** 1..7, into the `--speaker-N` tokens. */
  colourIndex: number;
  /** The speaker's name, or `?` when none is known. */
  label: string;
  state: Phrase['state'];
};
export type Layer = MarkLayer | WordLayer | NameLayer | FindLayer | PhraseLayer;

/** A piece of the paragraph's text, the layers that cover it from the outermost to the innermost, and the phrase it opens. */
export type LayerPiece = { start: number; text: string; layers: Layer[]; chipFor?: PhraseLayer };

/** Phrases are outermost, so a click on a mark or a name inside a quote reaches the mark; find matches are innermost. */
const RANK: Record<Layer['kind'], number> = { phrase: 0, name: 1, word: 2, mark: 3, find: 4 };

const layerId = (layer: Layer): string => {
  switch (layer.kind) {
    case 'mark':
      return layer.id;
    case 'word':
      return layer.flagId;
    case 'name':
      return layer.entryId;
    case 'phrase':
      return layer.cueId;
    case 'find':
      return '';
  }
};

/**
 * Splits `text` at every layer boundary. Offsets outside the text are clamped to it, and a layer that is then empty (or has a
 * non-numeric offset) is dropped, so the pieces always rebuild the text.
 */
export function composeLayers(text: string, layers: readonly Layer[]): LayerPiece[] {
  const clamp = (offset: number): number => Math.min(Math.max(offset, 0), text.length);
  const inside = layers.map((layer) => ({ layer, start: clamp(layer.start), end: clamp(layer.end) })).filter(({ start, end }) => start < end);
  const points = [...new Set([0, text.length, ...inside.flatMap(({ start, end }) => [start, end])])].sort((a, b) => a - b);
  const opened = new Set<string>();
  return points.slice(0, -1).flatMap((start, i) => {
    const end = points[i + 1];
    const covering = inside
      .filter((bounds) => bounds.start <= start && bounds.end >= end)
      .sort((a, b) => RANK[a.layer.kind] - RANK[b.layer.kind] || b.end - b.start - (a.end - a.start) || layerId(a.layer).localeCompare(layerId(b.layer)));
    const chip = covering.find(({ layer, start: from }) => layer.kind === 'phrase' && from === start && !opened.has(layer.cueId));
    if (chip?.layer.kind === 'phrase') opened.add(chip.layer.cueId);
    const piece: LayerPiece = { start, text: text.slice(start, end), layers: covering.map((bounds) => bounds.layer) };
    if (chip?.layer.kind === 'phrase') piece.chipFor = chip.layer;
    return piece.text ? [piece] : [];
  });
}

/** What a paragraph's layers are drawn from. */
export type LayerSources = {
  marks: readonly Mark[];
  markTypes: readonly MarkType[];
  words: readonly ScriptWord[];
  entries: readonly GuideEntity[];
  cues: readonly GuideDialogueCue[];
};

export type LayerIndex = {
  sources: LayerSources;
  marksBy: ReadonlyMap<string, Mark[]>;
  wordsBy: ReadonlyMap<string, WordLayer[]>;
};

const pushTo = <T>(map: Map<string, T[]>, key: string, value: T): void => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

/** Groups the marks and flags by paragraph once, so drawing a paragraph does not scan every mark of the book. */
export function buildLayerIndex(sources: LayerSources): LayerIndex {
  const marksBy = new Map<string, Mark[]>();
  sources.marks.forEach((mark) => !mark.stale && pushTo(marksBy, mark.paragraphId, mark));
  const wordsBy = new Map<string, WordLayer[]>();
  sources.words.forEach((word) =>
    word.flags.forEach((flag) => {
      if (!flag.stale)
        pushTo(wordsBy, flag.paragraphId, { kind: 'word', key: word.word, flagId: flag.id, status: word.status, start: flag.start, end: flag.end });
    }),
  );
  return { sources, marksBy, wordsBy };
}

const markLayer = (types: readonly MarkType[], mark: Mark): MarkLayer => {
  const type = types.find((candidate) => candidate.key === mark.type);
  return {
    kind: 'mark',
    id: mark.id,
    start: mark.start,
    end: mark.end,
    colour: type?.colour ?? 'copper',
    style: type?.style ?? 'highlight',
    ask: type?.asks ?? false,
    note: !(type?.asks ?? false) && mark.text.trim() !== '',
    name: type?.name ?? mark.type,
  };
};

const phraseLayer = (phrase: Phrase): PhraseLayer => ({
  kind: 'phrase',
  cueId: phrase.cueId,
  start: phrase.start,
  end: phrase.end,
  speakerId: phrase.speaker?.id ?? null,
  colourIndex: speakerColorIndex(phrase.speaker?.id, phrase.speaker?.speaker_color),
  label: phrase.speaker?.canonical_name ?? '?',
  state: phrase.state,
});

/** Every layer one paragraph draws except Find, which the reader adds from its matches. */
export function paragraphLayers(index: LayerIndex, paragraph: Pick<ManuscriptParagraph, 'id' | 'chapterId' | 'text'>): Layer[] {
  const { markTypes, entries, cues } = index.sources;
  const entryKind = new Map(entries.map((entry) => [entry.id, entry.category]));
  return [
    ...(index.marksBy.get(paragraph.id) ?? []).map((mark) => markLayer(markTypes, mark)),
    ...(index.wordsBy.get(paragraph.id) ?? []),
    ...mentionsIn(entries, paragraph.text).map((m): NameLayer => ({
      kind: 'name',
      entryId: m.entryId,
      entryKind: entryKind.get(m.entryId) ?? '',
      start: m.start,
      end: m.end,
    })),
    ...phrasesOf(cues, entries, paragraph).map(phraseLayer),
  ];
}
