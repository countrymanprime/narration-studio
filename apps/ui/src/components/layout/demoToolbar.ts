import type { ReactNode } from 'react';

// The demo banner's toolbar slot: something the site build mounts outside the app's tree (the Simulated DAW badge) is drawn inside the banner,
// so it sits in the banner's row instead of floating over a page. The banner counts itself in while it is on screen, so the item's own root
// knows when no banner is there (the Booth draws none) and it has to draw the item itself.

type Listener = () => void;
const listeners = new Set<Listener>();
let item: (() => ReactNode) | null = null;
let slots = 0;
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Puts `render` in the banner's toolbar slot; `null` empties it. */
export function setDemoToolbarItem(render: (() => ReactNode) | null): void {
  item = render;
  notify();
}

export const demoToolbarItem = { subscribe, current: () => item };

/** How many banners are on screen to draw the item: the banner adds itself while mounted. */
export const demoToolbarSlots = {
  subscribe,
  count: () => slots,
  /** Counts one banner in; returns the call that counts it out. */
  enter: () => {
    slots += 1;
    notify();
    return () => {
      slots -= 1;
      notify();
    };
  },
};
