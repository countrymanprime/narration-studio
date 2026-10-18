import { useBoothSideOpen } from '../side/BoothSidePanel';
import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';

// The Booth while its chapters are read: the same frame as `BoothSession` (the top bar's height, the reading column, the side panel's 20 rem
// when it is inline, the footer), so the page does not jump when it arrives. The page's hidden h1 stays outside it, in `BoothNextPage`.
// The side panel is a drawer at 1280 px and below (`useBoothSideOpen`), so it is not drawn then, as it is not drawn closed.
export function BoothSkeleton() {
  const { drawer } = useBoothSideOpen();
  return (
    <LoadingRegion label="Loading the Booth" status="Reading the chapters…" className="flex size-full flex-col bg-[var(--bg)]">
      <div className="flex min-h-13 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-1.5">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="hidden w-40 sm:block" />
        <span className="flex-1" />
        <Skeleton className="w-24" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 px-7">
          <div className="mx-auto flex max-w-[26em] flex-col gap-3 py-[30vh]">
            <Skeleton className="w-full" />
            <Skeleton className="w-11/12" />
            <Skeleton className="w-4/5" />
          </div>
        </div>
        {drawer ? null : (
          <div className="flex w-80 max-w-full flex-col gap-4 border-l border-[var(--border)] bg-[var(--surface)] p-3">
            <Skeleton tall />
            <Skeleton tall />
            <Skeleton tall />
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-2.5">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="w-16" />
      </div>
    </LoadingRegion>
  );
}
