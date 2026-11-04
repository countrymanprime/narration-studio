import type { ReactNode } from 'react';
import { ExtensionBanner } from '../../../appExtension';
import { Brand } from '../../layout/Brand';

/**
 * The frame Settings is drawn in while no project is open (issue 3024): the project picker's own frame (the mark, one scrolling column), with
 * the Settings page in it. There is no navigation rail or top bar, since every page of the app needs a project; the page's Back returns to
 * the picker. The page is the same `SettingsPage` the shell shows, told by its data that no project is open.
 */
export function NoProjectSettings({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ExtensionBanner />
      {/* tabIndex -1 like AppShell's <main> and the picker's: a dialog that closes with nothing to give focus back to sends it here. */}
      <main tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-[var(--page-gutter)] pt-6 focus:outline-none">
        <div className="mx-auto flex w-full max-w-[80rem] min-w-0 flex-col gap-5">
          <div className="flex items-center gap-[0.625rem]">
            <Brand />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
