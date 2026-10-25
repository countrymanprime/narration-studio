import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';

// What stands where the Production overview will be while the production log is read: the KPI card, the three cards, the chapter pipeline and
// the two side panels, as blocks in the same grids as the loaded page (the KPI card's own container widths, the board's rows), so nothing
// moves when the overview arrives (alignment audit XPR2-41). The page's header (title, counts, buttons) is drawn above it by the page itself.
const CARD = 'rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)]';

export function ProductionSkeleton() {
  return (
    <LoadingRegion label="Loading the production overview" status="Reading the production log…" className="flex flex-col gap-4">
      <div className={`@container overflow-hidden ${CARD}`}>
        <div className="grid grid-cols-1 @min-[22rem]:grid-cols-2 @min-[36rem]:grid-cols-3 @min-[64rem]:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((tile) => (
            <div key={tile} className="flex flex-col gap-2 px-4 pt-3.5 pb-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[640px]:grid-cols-2 min-[1281px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_22.5rem] min-[640px]:max-[1281px]:[&>:first-child]:col-span-2">
        {[0, 1, 2].map((card) => (
          <Skeleton key={card} className="h-40" />
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1281px]:grid-cols-[minmax(0,1fr)_22.5rem]">
        <Skeleton className="h-80" />
        <div className="flex min-w-0 flex-col gap-4 max-[1281px]:order-first min-[640px]:max-[1281px]:grid min-[640px]:max-[1281px]:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-48" />
        </div>
      </div>
    </LoadingRegion>
  );
}
