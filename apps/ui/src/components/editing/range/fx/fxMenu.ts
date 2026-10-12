import type { FxList } from '../../../../ports/daw';
import type { ContextMenuItem } from '../../../primitives/ContextMenu';

/** The sentence for an Add FX menu with nothing to choose: where the DAW looks is the DAW's own, so the sentence names only its source. */
const noneSentence = (source: string): string => `${source} lists no effects yet. Save one in the DAW and it appears here.`;

export interface FxMenuInput {
  /** The DAW's list, or null while it cannot list. */
  list: FxList | null;
  /** Why the DAW cannot list (the capability's own sentence), shown on the one item that stands in for the list. */
  listWhy: string;
  /** Why the chains are off for this selection, or ''. */
  refusal: string;
  /** The DAW as the narrator calls it, for "Manage in …". */
  dawName: string;
  onPick: (chainId: string) => void;
}

const NO_ANSWER = 'Could not ask the DAW what it can do.';

/**
 * The menu of the DAW's effects: its source line, its chains and a disabled "Manage in <DAW>…". The chains are whatever the list holds and are
 * never named here. A chain the DAW cannot add now is disabled with the DAW's sentence; with no list the menu says why; with no chains it says the DAW lists none.
 */
export function fxMenuItems({ list, listWhy, refusal, dawName, onPick }: FxMenuInput): ContextMenuItem[] {
  const manage: ContextMenuItem = {
    key: 'fx-manage',
    label: `Manage in ${dawName}…`,
    unavailable: `${dawName} keeps its own effects; the app cannot open them yet.`,
    onSelect: () => {},
  };
  if (!list) return [{ key: 'fx-off', label: 'Add FX', unavailable: refusal || listWhy || NO_ANSWER, onSelect: () => {} }, manage];
  const source: ContextMenuItem = { key: 'fx-source', label: list.source, unavailable: '', onSelect: () => {} };
  if (!list.choices.length) {
    return [source, { key: 'fx-none', label: 'No effects listed', unavailable: noneSentence(list.source), onSelect: () => {} }, manage];
  }
  return [
    source,
    ...list.choices.map((c) => ({ key: `fx:${c.id}`, label: c.name, ...(refusal ? { unavailable: refusal } : {}), onSelect: () => onPick(c.id) })),
    manage,
  ];
}
