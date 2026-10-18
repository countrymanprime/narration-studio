import { LoadingRegion, Skeleton } from '../../../primitives/Skeleton';
import { PANEL_FRAME_CLASS } from '../../../primitives/panelStyles';

// The Script page while its chapters are read: the same grid tracks as `ScriptColumns` (the chapter list at 240 px from 1180 px, the
// reader, the rail at 380 px from 1281 px), each a framed panel of blocks, so the columns do not move when the manuscript arrives. The page's
// visually hidden title stays, as it does on the loaded page, outside the busy region.
export function ScriptSkeleton() {
  return (
    <>
      <h1 className="sr-only">Script</h1>
      <LoadingRegion
        label="Loading the Script"
        status="Reading the manuscript…"
        className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-4 min-[1180px]:grid-cols-[240px_minmax(0,1fr)] min-[1281px]:grid-cols-[240px_minmax(0,1fr)_380px]"
      >
        <div className={`hidden min-h-0 flex-col gap-3 p-3 min-[1180px]:flex ${PANEL_FRAME_CLASS}`}>
          <Skeleton className="w-24" />
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-9" />
          ))}
        </div>
        <div className={`flex min-h-0 min-w-0 flex-col gap-4 p-5 ${PANEL_FRAME_CLASS}`}>
          <Skeleton className="h-8 w-1/3" />
          {[0, 1, 2].map((paragraph) => (
            <div key={paragraph} className="flex max-w-3xl flex-col gap-2">
              <Skeleton className="w-full" />
              <Skeleton className="w-11/12" />
              <Skeleton className="w-3/5" />
            </div>
          ))}
        </div>
        <div className={`hidden min-h-0 flex-col gap-3 p-3 min-[1281px]:flex ${PANEL_FRAME_CLASS}`}>
          <Skeleton className="w-28" />
          <Skeleton tall />
          <Skeleton tall />
        </div>
      </LoadingRegion>
    </>
  );
}
