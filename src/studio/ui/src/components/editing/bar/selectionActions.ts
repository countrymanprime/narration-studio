import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import type { ChapterDoc, SelSummary } from '../model';

/** What an action sees when the bar or the toolbar draws it: the selection and whether every selected word is cut. */
interface SelectionActionContext {
  doc: ChapterDoc;
  /** The keys selected, in the order of the text; empty when nothing is. */
  keys: string[];
  summary: SelSummary;
  /** Every selected word is cut, so Restore takes the place of Add FX, Mute and Delete. */
  allCut: boolean;
  /** Where the action is drawn, and whether the bar is narrow (the mock's `layout.medium`): Delete names itself in full only in the wide bar. */
  place: 'bar' | 'toolbar';
  narrow?: boolean;
}

export interface SelectionAction {
  id: string;
  /** Lower comes first; two actions with one order keep the order they registered in. */
  order: number;
  /** The bar under the script, the toolbar under the selection, or both. */
  where: 'bar' | 'toolbar' | 'both';
  /** The control, or null when the action has nothing to offer for this selection. Draw a refusal with `SelectionActionButton`. */
  render: (context: SelectionActionContext) => ReactNode;
}

let actions: readonly SelectionAction[] = [];
const listeners = new Set<() => void>();

/** Adds an action to the Editing bar and the floating toolbar and returns the function that removes it. A second action with the same id replaces the first. */
export function registerSelectionAction(action: SelectionAction): () => void {
  const entry = { ...action };
  const rest = actions.filter((a) => a.id !== entry.id);
  const at = rest.findIndex((a) => a.order > entry.order);
  actions = at < 0 ? [...rest, entry] : [...rest.slice(0, at), entry, ...rest.slice(at)];
  listeners.forEach((l) => l());
  return () => {
    if (!actions.includes(entry)) return;
    actions = actions.filter((a) => a !== entry);
    listeners.forEach((l) => l());
  };
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The registered actions for one place, in order. */
export function useSelectionActions(where: 'bar' | 'toolbar'): readonly SelectionAction[] {
  const all = useSyncExternalStore(subscribe, () => actions);
  return all.filter((a) => a.where === 'both' || a.where === where);
}
