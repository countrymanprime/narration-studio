import { Heading } from '../primitives/Heading';
import { LoadingRegion, Skeleton } from '../primitives/Skeleton';

// The Schedule page while its plan, chapters and take log are read: the title stays, then the header's verdict, the two-column row (the chart,
// the contract and the worked-out sums) and the milestones, as blocks of the loaded page's size. The chart is its 280 px.
export function ScheduleSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1.5">
          <Heading title="Schedule" />
          <Skeleton className="w-48" />
        </div>
        <span className="flex-1" />
        <Skeleton className="h-8 w-40" />
      </div>
      <LoadingRegion label="Loading the Schedule" status="Loading the schedule…" className="flex flex-col gap-4">
        <div className="grid items-stretch gap-4 md:grid-cols-2">
          <Skeleton className="h-[280px]" />
          <div className="flex min-w-0 flex-col gap-4">
            <Skeleton tall />
            <Skeleton tall />
          </div>
        </div>
        <Skeleton className="h-48" />
      </LoadingRegion>
    </div>
  );
}
