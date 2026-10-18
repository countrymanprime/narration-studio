import { LoadingRegion, Skeleton } from '../primitives/Skeleton';

// The Story Bible while its entries are read: row-sized blocks in the list, one busy region carrying the single status sentence, and blocks in the
// detail pane, which has nothing to say about an entry yet. Both stand where the loaded page's list and detail are, under the page's own title,
// tabs, search and kind chips, so nothing moves when the entries arrive.
export function GuideListSkeleton() {
  return (
    <LoadingRegion label="Loading the Story Bible entries" status="Reading the Story Bible…" className="flex flex-col gap-2 p-1">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <Skeleton key={row} className="h-12" />
      ))}
    </LoadingRegion>
  );
}

export function GuideDetailSkeleton() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton tall />
      <Skeleton tall />
      <Skeleton className="h-40" />
    </div>
  );
}
