import { Heading } from '../primitives/Heading';
import { PANEL_FRAME_CLASS } from '../primitives/panelStyles';
import { LoadingRegion, Skeleton } from '../primitives/Skeleton';
import { SCHEDULE_GRID, SCHEDULE_SIDE } from './layout';

// The Schedule page while its plan, chapters and take log are read: the title stays, then the due-date line, and the page's own grids
// (layout.ts) holding card frames with a header row and blocks the size of the loaded cards (alignment audit XSH-9): the chart's 280 px
// with its padding, the Contract's three rows, the worked-out sums and the milestones.
export function ScheduleSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Heading title="Schedule" />
        {/* The due-date line is as tall as the verdict pill on it. */}
        <Skeleton className="h-[1.375rem]! w-48" />
      </div>
      <LoadingRegion label="Loading the Schedule" status="Loading the schedule…" className="flex flex-col gap-4">
        <div className={SCHEDULE_GRID}>
          <Card body="min-h-[17.5rem] flex-1" />
          <div className={SCHEDULE_SIDE}>
            <Card body="h-[7.125rem]" />
            <Card body="h-[20.25rem]" />
          </div>
        </div>
        <Card body="h-24" />
      </LoadingRegion>
    </div>
  );
}

/** A card's frame and its 50 px header row with a title-sized block, over a body block of `body`'s size. */
function Card({ body }: { body: string }) {
  return (
    <div aria-hidden="true" className={`flex flex-col ${PANEL_FRAME_CLASS}`}>
      <div className="flex h-[3.125rem] items-center border-b border-[var(--border)] px-4">
        <Skeleton className="w-40" />
      </div>
      <div className={`p-4 ${body.includes('flex-1') ? 'flex flex-1 flex-col' : ''}`}>
        <Skeleton className={`w-full ${body}`} />
      </div>
    </div>
  );
}
