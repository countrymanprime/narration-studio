import type { Gesture } from './gestures';

/** One gesture as it reaches the router: the normalised gesture, the DOM target it happened on (for the target
 * guard, `targets.ts`) and how to consume it so nothing else also reacts (`isScrollKey`). */
export type GestureEvent = {
  gesture: Gesture;
  target: EventTarget | null;
  preventDefault: () => void;
  /** Whether something nearer the target already took the key (a list that walks its own rows with the arrows). Keyboard only. */
  consumed?: () => boolean;
};

/**
 * A device the router can listen to (Solution Detail, docs/architecture/studio-shell-and-registries.md): one method, `subscribe`, returning its
 * own unsubscribe. The router depends only on this interface, never on a concrete device, so a test drives a fake
 * source and `KeyboardSource` is one implementation among others (`MidiSource`, `HidSource`, later phases).
 */
export type InputSource = {
  subscribe(onGesture: (event: GestureEvent) => void): () => void;
};
