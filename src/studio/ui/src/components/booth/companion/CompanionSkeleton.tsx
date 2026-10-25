import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CompactShell } from '../../primitives/CompactShell';
import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';
import { useWholeWindow } from './useWholeWindow';

// The Companion while its chapters are read: the same takeover as the loaded window (the whole window, `CompactShell`'s header with its
// title, the column of sections), with blocks where the playhead badge, the script and the five sections will be, on their measures
// (alignment audit XBO-14, R4BO1-5). It takes the window as the loaded
// one does, so the full app behind it is not read out beside it.
export function CompanionSkeleton() {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  useWholeWindow(root);
  return createPortal(
    <div ref={setRoot} data-companion="" className="fixed inset-0 z-[var(--z-takeover)] flex justify-center bg-[var(--bg)]">
      <CompactShell title="Companion" status={<Skeleton className="h-[1.375rem] w-28" />} action={<Skeleton className="h-7 w-[6.25rem]" />}>
        <LoadingRegion label="Loading the Companion" status="Reading the chapters…" className="flex flex-col gap-3">
          {/* The script: its label, the title, the three buttons and the framed scroll box. */}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-7 w-[6.25rem]" />
              <Skeleton className="h-7 w-24" />
            </div>
            <Skeleton className="h-48" />
          </div>
          {/* Pickups, Hotkeys, This chapter and the note: a label and two lines each, between the rules the loaded sections draw. */}
          {[0, 1, 2, 3].map((section) => (
            <div key={section} className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="w-full" />
              <Skeleton className="w-2/3" />
            </div>
          ))}
        </LoadingRegion>
      </CompactShell>
    </div>,
    document.body,
  );
}
