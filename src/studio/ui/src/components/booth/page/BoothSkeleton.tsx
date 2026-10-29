import type { ReactNode } from 'react';
import { useBoothSideOpen } from '../side/BoothSidePanel';
import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';

// The Booth while its chapters are read: the same frame as `BoothSession`, on its measures (the top bar's 56 px and page gutter, the text box's
// gutters and 26 em column, the side panel's 20 rem and 16 px padding when it is inline, the footer and its key hints), so the page does not
// jump when it arrives (alignment audit XBO-14, R4BO2-9). The page's hidden h1 stays outside it, in `BoothNextPage`.
// The side panel is a drawer at 1280 px and below (`useBoothSideOpen`), so it is not drawn then, as it is not drawn closed.
// `label` and `status` default to the first read of the chapters; the address gate passes its own while it re-reads the chapter list, with
// `title` and `exit` to stand in the top bar's first and last blocks: a Booth that is only checking a link has no sidebar to leave by.
export function BoothSkeleton({
  label = 'Loading the Booth',
  status = 'Reading the chapters…',
  title,
  exit,
}: {
  label?: string;
  status?: string;
  title?: ReactNode;
  exit?: ReactNode;
}) {
  const { drawer } = useBoothSideOpen();
  return (
    <LoadingRegion label={label} status={status} className="flex size-full flex-col bg-[var(--bg)]">
      {/* The top bar: the chapter stepper (36 + 340 + 36 px), the progress line, and the tools at the right gutter. */}
      <div className="flex min-h-14 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-[var(--border)] bg-[var(--surface)] px-[var(--page-gutter)] py-2.5">
        {title ?? <Skeleton className="h-9 w-[25.75rem] max-w-full" />}
        <Skeleton className="hidden w-64 sm:block" />
        {exit ? <span className="ml-auto">{exit}</span> : <Skeleton className="ml-auto h-9 w-40" />}
      </div>
      <div className="flex min-h-0 flex-1">
        {/* The text box's gutters (a page gutter and the ribbon margin a side) and its centred reading column. */}
        <div className="min-w-0 flex-1 px-[calc(var(--page-gutter)+1.75rem)]">
          <div className="mx-auto flex max-w-[65rem] flex-col gap-6 py-[30vh]">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-11/12" />
            <Skeleton className="h-9 w-4/5" />
          </div>
        </div>
        {drawer ? null : (
          <div className="flex w-80 max-w-full flex-col gap-[18px] border-l border-[var(--border)] bg-[var(--surface)] p-4">
            {[0, 1, 2].map((section) => (
              <div key={section} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="w-full" />
                <Skeleton className="w-3/4" />
              </div>
            ))}
          </div>
        )}
      </div>
      {/* The footer: Record, the timer and Levels, the meter at the right gutter, then the key hints strip. */}
      <div className="flex items-center gap-4 border-t border-[var(--border)] bg-[var(--surface)] px-[var(--page-gutter)] py-2.5">
        <Skeleton className="h-9 w-[5.75rem]" />
        <Skeleton className="w-16" />
        <Skeleton className="size-9" />
        <Skeleton className="ml-auto w-60" />
      </div>
      <div className="flex px-[var(--page-gutter)] py-2">
        <Skeleton className="w-2/3" />
      </div>
    </LoadingRegion>
  );
}
