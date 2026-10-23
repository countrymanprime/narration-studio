import { useEffect, useState, useSyncExternalStore } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { readStoredPlay, setPlayAnimations } from '@ui/motion';
import { Switch } from '@ui/components/primitives/Switch';
import { guideHref } from './demoGuide';
import { demoToolbarItem, demoToolbarSlots } from './demoToolbar';
import { inSiteWindow } from './siteWindow';

const REPO_URL = 'https://github.com/countrymanprime/narration-studio';

// Registered by register.ts, so only the demo builds draw it: the regular mock build used by Vitest, the Playwright visual suite and Storybook
// registers no banner, so it never appears in a captured app state or an atlas story. AGPL-3.0-or-later
// requires that a modified copy interacted with over a network offer its source (section 13); the
// demo is unmodified, but linking the source here keeps that offer visible rather than relying on
// a visitor finding it another way.
// The public site's own copy (`vite build --mode site`) sits at `demo/` beside the landing page and the Storybook, and links both by relative address.
const isSiteBuild = import.meta.env.VITE_SITE === '1';

// The guide that explains the page on screen (docs/guides/using-the-app/, rendered beside the demo). Inside the router it follows the route; the
// banner is also drawn by tests with no router, where it reads the address.
function RoutedGuideLink() {
  const { pathname } = useLocation();
  return <GuideLink path={pathname} />;
}
function GuideLink({ path }: { path: string }) {
  return (
    <a href={guideHref(path)} className="underline">
      How to use this page
    </a>
  );
}
function HowToUseThisPage() {
  const inRouter = useInRouterContext();
  return inRouter ? <RoutedGuideLink /> : <GuideLink path={window.location.hash} />;
}

// The demo's own Motion choice: a phone with Reduce Motion on would otherwise show none of the app's transitions (docs/design/motion-and-animation.md).
// Off follows the device, as the real app always does; the switch is not part of the app and is not in its Settings.
function PlayAnimationsSwitch() {
  const [on, setOn] = useState(readStoredPlay);
  return (
    // A plate that keeps the switch legible on the accent banner; squared, so it does not read as a status pill (badgeShapes.test.ts).
    <span className="inline-flex rounded-md bg-[var(--surface)] px-2.5 py-0.5 text-[var(--text)]">
      <Switch
        checked={on}
        onChange={(next) => {
          setPlayAnimations(next);
          setOn(next);
        }}
      >
        Play animations
      </Switch>
    </span>
  );
}

// Whatever the site build put in the banner's toolbar (the Simulated DAW badge), drawn in the banner's row so it covers no page.
function ToolbarSlot() {
  const item = useSyncExternalStore(demoToolbarItem.subscribe, demoToolbarItem.current);
  useEffect(() => demoToolbarSlots.enter(), []);
  return item ? item() : null;
}

// Drawn by every top-level screen (StartupScreen, ProjectPicker, AppShell; src/studio/ui/src/appExtension.tsx) so
// it shows before and after a project loads, so every page of the demo says it is a demo.
export function DemoBanner() {
  // Inside the site's demo window the page's title bar says all of this, and the frame cannot open the site's links anyway.
  if (inSiteWindow()) return null;
  return (
    <div
      role="note"
      className="flex flex-none flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-[var(--border)] bg-[var(--accent)] px-3 py-1.5 text-center text-sm text-[var(--accent-contrast)]"
    >
      <span>
        <b>Demo</b> — sample project, nothing you do here is saved.
      </span>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline">
        View source
      </a>
      <PlayAnimationsSwitch />
      <ToolbarSlot />
      {isSiteBuild && (
        <>
          <a href="../index.html" className="underline">
            Site
          </a>
          <a href="../storybook/index.html" className="underline">
            Storybook
          </a>
          <HowToUseThisPage />
          <span className="min-[860px]:hidden">Best on a larger screen: the app is built for a window at least 860 px wide.</span>
        </>
      )}
    </div>
  );
}
