const REPO_URL = 'https://github.com/countrymanprime/narration-utils';

// The public demo is the only build that sets VITE_DEMO: the
// regular `mock` build used by Vitest, the Playwright visual suite and Storybook does not, so this
// banner never appears in a captured app state or an atlas story. AGPL-3.0-or-later
// requires that a modified copy interacted with over a network offer its source (section 13); the
// demo is unmodified, but linking the source here keeps that offer visible rather than relying on
// a visitor finding it another way.
const isDemoBuild = import.meta.env.VITE_DEMO === '1';
// The public site's own copy (`vite build --mode site`) sits at `demo/` beside the landing page and the Storybook, and links both by relative address.
const isSiteBuild = import.meta.env.VITE_SITE === '1';

// Rendered unconditionally by every top-level screen (StartupScreen, ProjectPicker, AppShell) so
// it shows before and after a project loads, so every page of the demo says it is a demo. Self-gates on isDemoBuild so callers never branch on it.
export function DemoBanner() {
  if (!isDemoBuild) return null;
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
      {isSiteBuild && (
        <>
          <a href="../index.html" className="underline">
            Site
          </a>
          <a href="../storybook/index.html" className="underline">
            Storybook
          </a>
          <span className="min-[960px]:hidden">Best on a larger screen: the app is built for a window at least 960 px wide.</span>
        </>
      )}
    </div>
  );
}
