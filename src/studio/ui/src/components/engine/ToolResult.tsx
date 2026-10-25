import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleXmark, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import type { ReactNode } from 'react';
import { InsetCard } from '../primitives/InsetCard';

export type ToolResultTone = 'success' | 'warning' | 'danger';

const LOOK: Record<ToolResultTone, { icon: typeof faCircleCheck; color: string; frame: 'neutral' | 'warn' | 'danger' }> = {
  success: { icon: faCircleCheck, color: 'var(--ok-text)', frame: 'neutral' },
  warning: { icon: faTriangleExclamation, color: 'var(--warn-text)', frame: 'warn' },
  danger: { icon: faCircleXmark, color: 'var(--danger-text)', frame: 'danger' },
};

/**
 * What a REAPER tool's run came to, in the engine panel's dialogs: one look for every outcome, an inset box with the tone's icon and
 * the message at regular weight, so a success no longer reads as bold body text and an error as loose red text (alignment audit
 * R3EN1-3, R3EN2-13). A failure is an alert; anything else is a status. `children` is the detail under the message (a file list).
 */
export function ToolResult({ tone, message, children }: { tone: ToolResultTone; message: ReactNode; children?: ReactNode }) {
  const look = LOOK[tone];
  return (
    <InsetCard tone={look.frame} fill role={tone === 'danger' ? 'alert' : 'status'} className="flex items-start gap-2 text-sm">
      <FontAwesomeIcon icon={look.icon} className="mt-[0.2rem] flex-none" style={{ color: look.color }} aria-hidden="true" />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <p style={tone === 'success' ? undefined : { color: look.color }}>{message}</p>
        {children}
      </div>
    </InsetCard>
  );
}
