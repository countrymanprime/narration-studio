import type { MarkType } from '../../../../api/contracts/marks';
import type { ContextMenuItem } from '../../../primitives/ContextMenu';
import { registerWordMenuSection, type WordMenuSelection } from '../wordMenuRegistry';
import { ONLY_SAID } from './markCommands';
import { scriptSpanOf } from './scriptSpan';

/** What the three mark sections need of the page that holds them. */
export interface MarkMenuSource {
  /** The narrator's mark types, as the Script page offers them; empty until they have loaded. */
  types: () => MarkType[];
  mark: (selection: WordMenuSelection, type: MarkType) => void;
  addNote: (selection: WordMenuSelection) => void;
  markForPickup: (selection: WordMenuSelection) => void;
}

/** A selection with no script word has nothing to mark. */
const markRefusal = (selection: WordMenuSelection): string | undefined => (scriptSpanOf(selection.doc, selection.keys) ? undefined : ONLY_SAID);

/** The menu has no submenu yet, so the kinds are one item each, in the Script page's order. */
function markAsItems(source: MarkMenuSource, selection: WordMenuSelection): ContextMenuItem[] {
  const unavailable = markRefusal(selection);
  const types = source.types();
  if (types.length === 0) return [{ key: 'mark-as', label: 'Mark as', unavailable: 'The mark types have not loaded yet.', onSelect: () => {} }];
  return types.map((type) => ({
    key: `mark-as-${type.key}`,
    label: `Mark as ${type.name}`,
    ...(unavailable !== undefined ? { unavailable } : {}),
    onSelect: () => source.mark(selection, type),
  }));
}

/**
 * "Mark as <kind>" for each kind, "Add note…" and "Mark for pickup", between the effects and takes sections and Copy words. Registered
 * as three sections so each can be dropped alone. Returns the function that removes them.
 */
export function registerMarkMenuSections(source: MarkMenuSource): () => void {
  const removers = [
    registerWordMenuSection({ order: 250, items: (selection) => markAsItems(source, selection) }),
    registerWordMenuSection({
      order: 260,
      items: (selection) => {
        const unavailable = markRefusal(selection);
        return [{ key: 'add-note', label: 'Add note…', ...(unavailable !== undefined ? { unavailable } : {}), onSelect: () => source.addNote(selection) }];
      },
    }),
    registerWordMenuSection({
      order: 270,
      items: (selection) => [{ key: 'mark-for-pickup', label: 'Mark for pickup', onSelect: () => source.markForPickup(selection) }],
    }),
  ];
  return () => removers.forEach((remove) => remove());
}
