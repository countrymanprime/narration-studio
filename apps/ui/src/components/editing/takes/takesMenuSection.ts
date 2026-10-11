import type { ContextMenuItem } from '../../primitives/ContextMenu';
import { registerWordMenuSection, type WordMenuSelection } from '../menu/wordMenuRegistry';
import type { LinePassage, LineTake, TakesGate } from './types';

/** What the word menu's take section needs of the page that holds the takes. */
export interface TakesMenuSource {
  /** The line the selection is in, or null when it has no line with more than one take. */
  passageOf: (selection: WordMenuSelection) => LinePassage | null;
  /** Opens the line's takes under it. */
  show: (passage: LinePassage) => void;
  keep: (passage: LinePassage, take: LineTake) => void;
  gate: () => TakesGate;
}

/** "Show takes of this line" (T) and one "Keep <take>" per take, the active one marked; off with the DAW's sentence when it cannot choose. */
export function registerTakesMenuSection(source: TakesMenuSource): () => void {
  return registerWordMenuSection({
    order: 300,
    items: (selection): ContextMenuItem[] => {
      const passage = source.passageOf(selection);
      if (!passage || passage.takes.length < 2) return [];
      const gate = source.gate();
      const keepItems = passage.takes.map((t): ContextMenuItem => {
        const off = !gate.ok ? gate.reason : !t.usable ? (t.reason ?? 'This take cannot be chosen.') : undefined;
        return {
          key: `keep-take-${t.id}`,
          label: `Keep ${t.label}${t.active ? ' (active)' : ''}`,
          ...(off !== undefined ? { unavailable: off } : {}),
          onSelect: () => source.keep(passage, t),
        };
      });
      return [{ key: 'show-takes', label: 'Show takes of this line (T)', onSelect: () => source.show(passage) }, ...keepItems];
    },
  });
}
