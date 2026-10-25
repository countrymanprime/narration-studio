import type { ReactNode } from 'react';

// The one loading placeholder (the Studio Next mock's `.skeleton`, `settings.css`): a rounded block on --skeleton (--surface-2 in light,
// a step lighter than the surfaces in dark) with a --skeleton-sweep band that
// sweeps across it every 1.4 s. The sweep runs only under `motion-ok:`, so a reader who asked for reduced motion gets a still block.
// A page draws its real title and header, then `Skeleton` blocks where the data will be, sized like what replaces them so nothing moves
// when it arrives. Speed is not its job: it shows only while a read is pending, and the page's error state replaces it when the read fails.
const BLOCK =
  'rounded-md bg-[linear-gradient(90deg,var(--skeleton),var(--skeleton-sweep),var(--skeleton))] bg-[length:200%_100%] motion-ok:animate-[skeleton-shimmer_1.4s_linear_infinite]';

/** A placeholder block. Height is `h-5` (the mock's 20 px) or, with `tall`, `h-16` (its 64 px); `className` sets the width and layout. */
export function Skeleton({ tall = false, className = '' }: { tall?: boolean; className?: string }) {
  return <div aria-hidden="true" className={`${BLOCK} ${tall ? 'h-16' : 'h-5'} ${className}`} />;
}

/**
 * Everything on a page that is still loading, as one busy group a screen reader meets once: `label` names it, `status` is the single polite
 * sentence announced ("Reading the chapters…"), and the `Skeleton` blocks inside are hidden from assistive tech. The page unmounts it when
 * the read ends, whether it succeeded or failed.
 */
export function LoadingRegion({ label, status, className = '', children }: { label: string; status: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-busy="true" aria-label={label} className={className}>
      {children}
      <span className="sr-only" role="status">
        {status}
      </span>
    </div>
  );
}
