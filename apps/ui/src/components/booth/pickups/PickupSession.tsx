import { createContext, useContext } from 'react';
import type { PickupItem } from '../../../api/contracts/pickups';
import { IconButton } from '../../primitives/IconButton';
import { InsetCard } from '../../primitives/InsetCard';
import { StatusBadge } from '../../primitives/StatusBadge';
import { statusLabel, statusTone } from '../../../kinds/statusTone';
import { registerBoothSection } from '../side/sections';
import { DIM_CLASS, SideSection } from '../side/SideSection';
import type { PickupSessionModel } from './usePickupSession';

/** Seconds into the chapter as m:ss, or nothing when the source gave no time. */
const clock = (seconds: number | null): string => {
  if (seconds === null) return '';
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

const rowLabel = (line: PickupItem, chapterLabel: (chapterId: string) => string): string =>
  [chapterLabel(line.chapterId), clock(line.time)].filter(Boolean).join(' · ');

/**
 * One pickup as a card, as the Pickups page and the site show them: its status chip (Open or Recorded, the page's own tones), the chapter and
 * time, and the line. The current one is framed in the accent. A press on the line jumps to it. A line the speech check found carries an
 * Automatic chip and a Dismiss action while it is open.
 */
function PickupCard({
  line,
  current,
  chapterLabel,
  onJump,
  onDismiss,
}: {
  line: PickupItem;
  current: boolean;
  chapterLabel: (chapterId: string) => string;
  onJump: (id: string) => void;
  onDismiss: (id: string) => Promise<unknown>;
}) {
  const automatic = line.source === 'speech';
  const state = line.done ? 'recorded' : 'open_pickup';
  return (
    <InsetCard as="li" tone={current ? 'accent' : 'neutral'} fill={current} frame="snug" className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <StatusBadge tone={statusTone(state)} label={statusLabel(state)} />
        {automatic ? <StatusBadge tone="neutral" label="Automatic" shape="tag" /> : null}
        <span className="flex-1" />
        {automatic && !line.done ? <IconButton action="close" label={`Dismiss: ${line.script}`} size="sm" onClick={() => void onDismiss(line.id)} /> : null}
      </div>
      {/* native-control-ok: the whole card body is one jump target, set as running text, which Button's padded chrome would box in */}
      <button
        type="button"
        data-pj={line.id}
        aria-current={current ? 'true' : undefined}
        onClick={() => onJump(line.id)}
        className="flex w-full cursor-pointer flex-col gap-0.5 border-0 bg-transparent p-0 pr-2 text-left text-sm text-[var(--text)]"
      >
        <span className="font-mono text-xs text-[var(--text-muted)]">{rowLabel(line, chapterLabel)}</span>
        <span className={`line-clamp-3 ${line.done && !current ? 'text-[var(--text-muted)]' : ''}`}>{line.script}</span>
      </button>
    </InsetCard>
  );
}

/**
 * The side panel's pickup list in a session: a card for each line, the open ones counted in the heading. Outside a session there is nothing to draw.
 */
export function PickupSession({
  session,
  chapterLabel = (chapterId) => chapterId,
}: {
  session: PickupSessionModel;
  chapterLabel?: (chapterId: string) => string;
}) {
  if (!session.active) return null;
  return (
    <SideSection title={`Pickups · ${session.open} open`} id="booth-pickups">
      {session.lines.length === 0 ? <div className={DIM_CLASS}>Nothing left in this session.</div> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {session.lines.map((line) => (
          <PickupCard
            key={line.id}
            line={line}
            current={line.id === session.at}
            chapterLabel={chapterLabel}
            onJump={session.jump}
            onDismiss={session.dismiss}
          />
        ))}
      </ul>
    </SideSection>
  );
}

type SessionContextValue = { session: PickupSessionModel; chapterLabel?: (chapterId: string) => string };

const SessionContext = createContext<SessionContextValue | null>(null);

/** The page gives its session (`usePickupSession`) and how it names a chapter to the registered section through this. */
export const PickupSessionProvider = SessionContext.Provider;

function PickupSessionSection() {
  const value = useContext(SessionContext);
  return value ? <PickupSession session={value.session} chapterLabel={value.chapterLabel} /> : null;
}

/** Adds the list to the Booth side panel, ahead of its other sections: in a session the lines come first. Called once by the page. */
export function registerPickupSession(): void {
  registerBoothSection('pickups', PickupSessionSection, 5);
}
