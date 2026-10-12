import type { GuideEntity, ManuscriptNote, ManuscriptParagraph, PrepMarkupSpan, TextSpan } from '../../types';

// The character-offset annotations a paragraph carries: Story Bible entity mentions, note anchors, text formatting and the
// narrator's script markup. The read-aloud reader maps the entity and note ones onto its words (`readerModel.marksOnWords`); the file
// goes with the Booth's swap (SNO-10).
export type Annotation = {
  id: string;
  start: number;
  end: number;
  length: number;
  kind: 'entity' | 'note' | 'format' | 'markup';
  entity?: GuideEntity;
  note?: ManuscriptNote;
  style?: TextSpan['style'];
  markup?: PrepMarkupSpan;
};
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A note stores where its anchor text sat when it was created. If that range no
// longer holds the anchor text (an older, misaligned anchor, or text that
// changed) re-locate the text nearest the stored position rather than
// highlighting the wrong words. If the text cannot be found the stored range is
// kept as-is, so a note never silently disappears.
function resolveNoteAnchor(note: ManuscriptNote, text: string): { start: number; end: number } | undefined {
  const { anchorStart: start, anchorEnd: end, anchorText } = note;
  // A negative stored start is clamped to the top of the text (String.slice would count it from the end).
  const from = start === undefined ? undefined : Math.max(start, 0);
  const stored = from !== undefined && end !== undefined && from < end && from < text.length ? { start: from, end: Math.min(end, text.length) } : undefined;
  if (stored && (!anchorText || text.slice(stored.start, stored.end) === anchorText)) return stored;
  return (anchorText ? relocate(text, anchorText, start ?? 0) : undefined) ?? stored;
}

function relocate(text: string, anchorText: string, near: number): { start: number; end: number } | undefined {
  let best: number | undefined;
  for (let at = text.indexOf(anchorText); at !== -1; at = text.indexOf(anchorText, at + 1)) {
    if (best === undefined || Math.abs(at - near) < Math.abs(best - near)) best = at;
  }
  return best === undefined ? undefined : { start: best, end: best + anchorText.length };
}

/** Every case-insensitive mention of each of the paragraph's entities, by its canonical name and each alias. */
export function entityAnnotations(paragraph: Pick<ManuscriptParagraph, 'text' | 'entityIds'>, entitiesById: Map<string, GuideEntity>): Annotation[] {
  const found: Annotation[] = [];
  paragraph.entityIds.forEach((id) => {
    const entity = entitiesById.get(id);
    if (!entity) return;
    [entity.canonical_name, ...entity.aliases.map((alias) => alias.text)].filter(Boolean).forEach((term, termIndex) => {
      const re = new RegExp(escapeRegExp(term), 'gi');
      let match: RegExpExecArray | null;
      while ((match = re.exec(paragraph.text)))
        found.push({
          id: `entity-${entity.id}-${termIndex}-${match.index}`,
          start: match.index,
          end: match.index + match[0].length,
          length: match[0].length,
          kind: 'entity',
          entity,
        });
    });
  });
  return found;
}

/** The anchors of the notes on this paragraph (matched by `note.paragraph`), re-located when the stored range drifted. */
export function noteAnnotations(paragraph: Pick<ManuscriptParagraph, 'text' | 'index'>, notes: ManuscriptNote[]): Annotation[] {
  return notes.flatMap((note) => {
    if (note.paragraph !== paragraph.index) return [];
    const anchor = resolveNoteAnchor(note, paragraph.text);
    return anchor ? [{ id: `note-${note.id}`, ...anchor, length: anchor.end - anchor.start, kind: 'note' as const, note }] : [];
  });
}
