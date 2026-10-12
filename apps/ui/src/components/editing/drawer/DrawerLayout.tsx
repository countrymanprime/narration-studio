import type { ReactNode } from 'react';

/** From this width of the page root the drawer is a column beside the text; at or below 1280 it overlays the text. A class on the page root, not a media query. */
const DRAWER_COLUMN = '@min-[1281px]:static @min-[1281px]:w-auto';
const OVERLAY = 'absolute inset-y-2 right-2 z-30 w-[min(360px,calc(100%-16px))] shadow-[var(--shadow-lg)]';

/** The text with the drawer beside it (wide) or over it (narrow). The page root above carries `@container` (`StripRoot`). */
export function DrawerLayout({ open, drawer, children }: { open: boolean; drawer: ReactNode; children: ReactNode }) {
  return (
    <div
      data-drawer-open={open || undefined}
      className={`relative grid min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 ${open ? '@min-[1281px]:grid-cols-[minmax(0,1fr)_352px]' : ''}`}
    >
      <div className="min-h-0 min-w-0">{children}</div>
      {open ? (
        <div data-drawer-slot className={`${OVERLAY} ${DRAWER_COLUMN} flex min-h-0`}>
          {drawer}
        </div>
      ) : null}
    </div>
  );
}
