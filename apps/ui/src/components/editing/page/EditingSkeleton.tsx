import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';

// What stands where the Editing page's script will be while the chapters, or the chapter's lines, are read: three paragraphs of lines in the
// script's column. The page's own header (the title, the chapter step, the two header buttons) is drawn above it by the caller, not here.
export function EditingBodySkeleton({ label, status }: { label: string; status: string }) {
  return (
    <LoadingRegion label={label} status={status} className="flex min-h-0 flex-1 flex-col gap-6 px-4 pt-3">
      {[0, 1, 2].map((paragraph) => (
        <div key={paragraph} className="flex max-w-3xl flex-col gap-2">
          <Skeleton className="w-full" />
          <Skeleton className="w-11/12" />
          <Skeleton className="w-3/5" />
        </div>
      ))}
    </LoadingRegion>
  );
}
