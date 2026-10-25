import type { ReactNode } from 'react';
import { InsetCard } from '../primitives/InsetCard';
import { StatusBadge } from '../primitives/StatusBadge';

export type ToolResultTone = 'success' | 'warning' | 'danger';

const LOOK: Record<ToolResultTone, { label: string; color?: string; frame: 'neutral' | 'warn' | 'danger' }> = {
  success: { label: 'Done', frame: 'neutral' },
  warning: { label: 'Check', color: 'var(--warn-text)', frame: 'warn' },
  danger: { label: 'Failed', color: 'var(--danger-text)', frame: 'danger' },
};

/**
 * What a REAPER tool's run came to, in the engine panel's dialogs: one look for every outcome, an inset box led by a tone badge
 * (Done, Check, Failed) with the message at regular weight, so a success no longer reads as bold body text and an error as loose red
 * text (alignment audit R3EN1-3, R3EN2-13). A failure is an alert; anything else is a status. `children` is the detail under the
 * message (a file list).
 */
export function ToolResult({ tone, message, children }: { tone: ToolResultTone; message: ReactNode; children?: ReactNode }) {
  const look = LOOK[tone];
  return (
    <InsetCard tone={look.frame} fill role={tone === 'danger' ? 'alert' : 'status'} className="flex items-start gap-2 text-sm">
      <span className="flex-none">
        <StatusBadge tone={tone} label={look.label} />
      </span>
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <p style={look.color ? { color: look.color } : undefined}>{message}</p>
        {children}
      </div>
    </InsetCard>
  );
}
