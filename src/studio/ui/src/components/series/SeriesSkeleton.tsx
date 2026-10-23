import { LoadingRegion, Skeleton } from '../primitives/Skeleton';

// The Series tab while the series' voice bible and the list of series are read: blocks where its first lines and the member list will be.
export function SeriesSkeleton() {
  return (
    <LoadingRegion label="Loading the series" status="Reading the series…" className="flex flex-col gap-3 p-4">
      <Skeleton className="w-2/3" />
      <Skeleton tall />
      <Skeleton tall />
    </LoadingRegion>
  );
}
