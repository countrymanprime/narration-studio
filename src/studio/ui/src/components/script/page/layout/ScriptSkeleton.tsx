import { LoadingRegion, Skeleton } from '../../../primitives/Skeleton';
import { PANEL_FRAME_CLASS } from '../../../primitives/panelStyles';
import { ScriptTitle } from './ScriptTitle';

// The Script page while its chapters are read: the same grid tracks as `ScriptColumns` (the chapter list at 240 px from 1180 px, the
// reader, the rail at 380 px from 1281 px), each a framed panel drawn in the loaded panel's own parts, so nothing jumps when the
// manuscript arrives (alignment audit XSC-42): the list's two-line rows over the key to the dots, the reader's 65 px header with its
// rule over a centred column of text, and the rail's 65 px tab strip. The page's visually hidden title stays, as it does on the loaded
// page, outside the busy region.
const HEADER = 'flex h-[4.0625rem] flex-none items-center gap-3 border-b border-[var(--border)]';

export function ScriptSkeleton() {
  return (
    <>
      <ScriptTitle />
      <LoadingRegion
        label="Loading the Script"
        status="Reading the manuscript…"
        className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-4 min-[1180px]:grid-cols-[240px_minmax(0,1fr)] min-[1281px]:grid-cols-[240px_minmax(0,1fr)_380px]"
      >
        <div data-skeleton-panel="chapters" className={`hidden min-h-0 flex-col overflow-hidden min-[1180px]:flex ${PANEL_FRAME_CLASS}`}>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-[1.125rem]">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
              <div key={row} className="flex flex-col gap-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className={row % 3 === 2 ? 'w-full' : 'w-3/4'} />
              </div>
            ))}
          </div>
          <div className="flex flex-none flex-col gap-1 border-t border-[var(--border)] bg-[var(--surface-2)] px-[1.125rem] py-2.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
        <div data-skeleton-panel="reader" className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${PANEL_FRAME_CLASS}`}>
          <div className={`${HEADER} px-6`}>
            <div className="flex w-1/3 flex-col gap-1.5">
              <Skeleton className="h-6" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="mx-auto flex w-full max-w-[64ch] flex-col gap-4 px-6 pt-5">
            <Skeleton tall />
            {[0, 1, 2].map((paragraph) => (
              <div key={paragraph} className="flex flex-col gap-2">
                <Skeleton className="w-full" />
                <Skeleton className="w-11/12" />
                <Skeleton className="w-3/5" />
              </div>
            ))}
          </div>
        </div>
        <div data-skeleton-panel="rail" className={`hidden min-h-0 flex-col overflow-hidden min-[1281px]:flex ${PANEL_FRAME_CLASS}`}>
          <div className={`${HEADER} px-3`}>
            {[0, 1, 2].map((tab) => (
              <Skeleton key={tab} className="h-3 w-16" />
            ))}
          </div>
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="w-28" />
            <Skeleton tall />
            <Skeleton tall />
          </div>
        </div>
      </LoadingRegion>
    </>
  );
}
