import { useSyncExternalStore, type ReactNode } from 'react';
import type { LinePassage } from './types';

/** What a control sees when the passage's footer draws it. */
interface TakeControlContext {
  passage: LinePassage;
  /** The take the DAW said it kept, or null. */
  keptId: string | null;
}

/** A control another slice adds to the footer of a line's takes: hide the others, a prep step, the split of a doubled read. */
export interface TakeControl {
  id: string;
  /** Lower comes first; two controls with one order keep the order they registered in. */
  order: number;
  /** The control, or null when it has nothing to offer for this line. */
  render: (context: TakeControlContext) => ReactNode;
}

let controls: readonly TakeControl[] = [];
const listeners = new Set<() => void>();

/** Adds a control to the footer of every line's takes and returns the function that removes it. A second control with the same id replaces the first. */
export function registerTakeControl(control: TakeControl): () => void {
  const entry = { ...control };
  const rest = controls.filter((c) => c.id !== entry.id);
  const at = rest.findIndex((c) => c.order > entry.order);
  controls = at < 0 ? [...rest, entry] : [...rest.slice(0, at), entry, ...rest.slice(at)];
  listeners.forEach((l) => l());
  return () => {
    if (!controls.includes(entry)) return;
    controls = controls.filter((c) => c !== entry);
    listeners.forEach((l) => l());
  };
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useTakeControls = (): readonly TakeControl[] => useSyncExternalStore(subscribe, () => controls);
