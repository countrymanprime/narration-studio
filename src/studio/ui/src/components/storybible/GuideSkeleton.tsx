import { PANEL_BODY_CLASS, PANEL_FRAME_CLASS, PANEL_HEADER_CLASS } from '../primitives/panelStyles';
import { LoadingRegion, Skeleton } from '../primitives/Skeleton';

// The Story Bible while its entries are read: one busy region carrying the single status sentence, and the loaded page's own shapes, so
// nothing moves when the entries arrive (alignment audit SBX-19). The list is the entry table's header strip and its 39 px rows (each a
// name block and a kind block, as the Name and Kind columns), and the detail is the entry card: its frame, its 50 px header with a name
// block, and its 16 px body. Both stand under the page's own title, search and filter, which are drawn while the entries load.
export function GuideListSkeleton() {
  return (
    <LoadingRegion label="Loading the Story Bible entries" status="Reading the Story Bible…" className="flex flex-col">
      <div className="h-[var(--header-row-height)] border-b border-[var(--border)]" />
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="flex h-[2.4375rem] items-center gap-4 border-b border-[var(--border)] px-2.5">
          <Skeleton className="h-4 flex-[3_1_0]" />
          <Skeleton className="h-4 flex-[2_1_0]" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function GuideDetailSkeleton() {
  return (
    <div className={`${PANEL_FRAME_CLASS} flex min-h-0 min-w-0 flex-1 flex-col`}>
      <div className={PANEL_HEADER_CLASS}>
        <Skeleton className="h-7 w-48" />
      </div>
      <div className={`${PANEL_BODY_CLASS} flex flex-col gap-4`}>
        <Skeleton className="h-9" />
        <Skeleton tall />
        <Skeleton tall />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
