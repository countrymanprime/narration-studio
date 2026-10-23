import { registerAppExtension, type AppExtension } from '@ui/appExtension';
import { DemoBanner } from './DemoBanner';
import { handedTheme, inSiteWindow, onSiteMessage, startSiteWindow } from './siteWindow';
import { simulateDaw, type SimulatedDaw } from './simulatedDaw';

// What the public site's demo plugs into the real app (src/studio/ui/src/appExtension.tsx). It must run before the app's modules load: entry.ts imports it first.
//
// Both demo builds (`--mode demo` for the Pages subpath and `--mode site`) show the banner, offer the Play animations switch and route by the hash.
// The site build alone (`VITE_SITE=1`) is the folder that sits beside the landing page, the docs and the Storybook: it boots the mock DAW with
// Experimental actions on and shows the Simulated DAW; and when it is the window's frame (`?embed=1`) the page around it owns the theme, the title
// bar and the Play animations switch, and the frame listens to the keyboard only (a frame gets no MIDI or HID, and asking logs an error).

const site = import.meta.env.VITE_SITE === '1';
let simulated: SimulatedDaw | undefined;

const extension: AppExtension = {
  Banner: DemoBanner,
  playAnimations: true,
  hashRouting: import.meta.env.VITE_ROUTER === 'hash',
  ...(site && {
    keyboardOnly: inSiteWindow(),
    experimentalDaw: true,
    wrapApi: (api) => {
      simulated = simulateDaw(api);
      return simulated.api;
    },
    hostTheme: {
      initial: handedTheme,
      subscribe: (listener) =>
        onSiteMessage((message) => {
          if (message.kind === 'theme') listener(message.theme);
        }),
    },
    start: () => {
      if (inSiteWindow()) startSiteWindow();
      // The Simulated DAW badge. Only the site build reaches the import, so no other build holds the panel or its text.
      const sim = simulated;
      if (sim) void import('./SimulatedDawPanel').then(({ mountSimulatedDawPanel }) => mountSimulatedDawPanel(sim, () => window.__NARRATION_MOCK_DAW__));
    },
  }),
};

registerAppExtension(extension);
