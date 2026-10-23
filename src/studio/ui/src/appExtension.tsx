import type { ComponentType } from 'react';
import type { NarrationApi } from './types';

// The one place another build of this app plugs in. The public demo site (src/web) is the real UI in its mock mode with a banner, a simulated DAW and a
// handshake with the page around it; none of that code lives in src/studio/ui. The site's entry registers an extension before it imports `main.tsx`, and
// the app reads the extension where it would otherwise branch on a build flag. The Wails build registers nothing, so every field is absent and the
// app behaves exactly as before. Nothing here names the site: another host page could use the same seams.
//
// Registration must happen before the app's modules are evaluated (an ES module graph evaluates a sibling import before the next one), because
// `main.tsx` reads `commandInput`, `experimentalDaw` and `wrapApi` while it loads.

/** What an embedding build hands the app. Every field is optional. */
export interface AppExtension {
  /** Drawn above the page by every top-level screen (the start screen, the project picker and the shell). */
  Banner?: ComponentType;
  /** Route by the address hash instead of the path, for a static host that cannot rewrite `/proof` to `index.html`. */
  hashRouting?: boolean;
  /** Offer the "Play animations" choice that overrides the device's reduced-motion setting (motion.ts). */
  playAnimations?: boolean;
  /** Listen to the keyboard only: a frame with no permissions grant gets no MIDI or HID. */
  keyboardOnly?: boolean;
  /** Boot the mock DAW with Experimental capabilities on. */
  experimentalDaw?: boolean;
  /** Wraps the mock API before the app uses it. Never called for the Wails client. */
  wrapApi?: (api: NarrationApi) => NarrationApi;
  /** A theme the embedding page chose: read at first paint, and followed while the page changes it. */
  hostTheme?: {
    initial: () => 'light' | 'dark' | null;
    subscribe: (listener: (theme: 'light' | 'dark') => void) => () => void;
  };
  /** Called once before the first render with the API the app will use. */
  start?: (api: NarrationApi) => void;
}

let extension: AppExtension = {};

/** Installs the extension; call it before the app's modules load. */
export function registerAppExtension(next: AppExtension): void {
  extension = next;
}

/** The registered extension, or an empty one. */
export function appExtension(): AppExtension {
  return extension;
}

/** Clears the extension: a test that registered one calls it afterwards. */
export function resetAppExtension(): void {
  extension = {};
}

/** Draws the registered banner, or nothing. */
export function ExtensionBanner() {
  const Banner = extension.Banner;
  return Banner ? <Banner /> : null;
}
