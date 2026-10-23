import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';

// What stands where the Production overview will be while the production log is read: the KPI row, the three cards, the chapter pipeline and the
// two side panels, as blocks in the same grids as the loaded page, so nothing moves when the overview arrives. The page's header (title, counts,
// buttons) is drawn above it by the page itself.
export function ProductionSkeleton() {
  return (
    <LoadingRegion label="Loading the production overview" status="Reading the production log…" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 min-[1024px]:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <Skeleton key={tile} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1024px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {[0, 1, 2].map((card) => (
          <Skeleton key={card} className="h-40" />
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 min-[1280px]:grid-cols-[minmax(0,1fr)_22.5rem]">
        <Skeleton className="h-80" />
        <div className="flex min-w-0 flex-col gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-48" />
        </div>
      </div>
    </LoadingRegion>
  );
}
