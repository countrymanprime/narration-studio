import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';

// What stands where the Editing page's script will be while the chapters, or the chapter's lines, are read: three paragraphs of lines in the
// script's own columns (the 76 px time gutter and the 1000 px text column, `script/Paragraph.tsx`), and the bar's band at the foot, so the
// text arrives where its blocks were (alignment audit R3ED-11, XED-30). The page's own header (the title, the chapter step, the two header
// buttons) is drawn above it by the caller, not here.
export function EditingBodySkeleton({ label, status }: { label: string; status: string }) {
  return (
    <LoadingRegion label={label} status={status} className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden pt-3 pr-7 pl-2">
        {[0, 1, 2].map((paragraph) => (
          <div key={paragraph} className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-1.5 border-l-[3px] border-transparent">
            <div className="flex justify-end pt-1 pr-2">
              <Skeleton className="w-9" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="w-full" />
              <Skeleton className="w-11/12" />
              <Skeleton className="w-3/5" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex h-[3.5rem] flex-none items-center gap-2 border-t border-[var(--border)] px-3.5">
        <Skeleton className="w-28" />
        <Skeleton className="w-20" />
      </div>
    </LoadingRegion>
  );
}
