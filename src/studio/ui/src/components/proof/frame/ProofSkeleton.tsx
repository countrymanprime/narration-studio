import { Heading } from '../../primitives/Heading';
import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';

// The Proof page while its chapters and notes are first read: the page title, then the loaded page's own cards as blocks (the head with its
// strip and the notes with their toolbar and rows on the left; the Inspector at 380 px from 1180 px, the height of both), each at its own
// height, so nothing moves when they arrive (alignment audit XPF-10). Without it the page drew its whole frame empty, "Reading the
// recording…" under a strip with no chapters and a notes list with none.
// `label` and `status` default to the first read of the chapters and notes; the address gate passes its own while it re-reads the chapter list.
export function ProofSkeleton({ label = 'Loading Proof', status = 'Reading the chapters and notes…' }: { label?: string; status?: string }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="grid flex-1 content-start gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_380px] min-[1180px]:grid-rows-[auto_minmax(0,1fr)]">
        <section aria-label="Proof" className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Heading title="Proof" />
            <Skeleton className="h-8 w-56 max-w-full" />
          </div>
          <LoadingRegion label={label} status={status} className="flex flex-col gap-3">
            <Skeleton className="w-40" />
            <Skeleton className="h-[54px]" />
          </LoadingRegion>
        </section>
        <div
          aria-hidden="true"
          className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 min-[1180px]:row-start-2"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="w-24" />
            <Skeleton className="h-7 w-72 max-w-full" />
          </div>
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-8" />
          ))}
        </div>
        <div
          aria-hidden="true"
          className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 min-[1180px]:col-start-2 min-[1180px]:row-span-2 min-[1180px]:row-start-1"
        >
          <Skeleton className="w-24" />
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-10" />
          ))}
        </div>
      </div>
    </div>
  );
}
