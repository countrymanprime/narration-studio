import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CompactShell } from '../../primitives/CompactShell';
import { LoadingRegion, Skeleton } from '../../primitives/Skeleton';
import { useWholeWindow } from './useWholeWindow';

// The Companion while its chapters are read: the same takeover as the loaded window (the whole window, `CompactShell`'s header with its
// title, the column of sections), with blocks where the playhead badge, the script and the sections will be. It takes the window as the loaded
// one does, so the full app behind it is not read out beside it.
export function CompanionSkeleton() {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  useWholeWindow(root);
  return createPortal(
    <div ref={setRoot} data-companion="" className="fixed inset-0 z-[var(--z-takeover)] flex justify-center bg-[var(--bg)]">
      <CompactShell title="Companion" status={<Skeleton className="h-6 w-28" />} action={<Skeleton className="h-7 w-20" />}>
        <LoadingRegion label="Loading the Companion" status="Reading the chapters…" className="flex flex-col gap-3">
          <Skeleton className="w-24" />
          <Skeleton tall />
          <Skeleton className="w-32" />
          <Skeleton tall />
        </LoadingRegion>
      </CompactShell>
    </div>,
    document.body,
  );
}
