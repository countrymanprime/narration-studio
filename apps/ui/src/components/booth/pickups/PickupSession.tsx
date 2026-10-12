import { createContext, useContext } from 'react';
import type { PickupItem } from '../../../api/contracts/pickups';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
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
 * The side panel's pickup list in a session (the mock's `SidePanel` `pkrow`s): each line with its chapter and time, the open ones
 * counted, the current one marked, done ones dimmed with a tick. A click jumps to the line. A line the speech check found is tagged
 * Automatic and can be dismissed. Outside a session there is nothing to draw.
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
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {session.lines.map((line) => {
          const automatic = line.source === 'speech';
          return (
            <li key={line.id} className="flex items-center gap-1">
              <Button
                variant={line.id === session.at ? 'primary' : 'secondary'}
                size="sm"
                data-pj={line.id}
                aria-current={line.id === session.at ? 'true' : undefined}
                onClick={() => session.jump(line.id)}
                className={`min-w-0 flex-1 justify-start text-left ${line.done ? 'opacity-60' : ''}`}
              >
                <span className="font-mono text-xs font-normal whitespace-nowrap normal-case">{rowLabel(line, chapterLabel)}</span>
                <span className="min-w-0 flex-1 truncate font-normal normal-case">{line.script}</span>
                {automatic ? <span className="text-xs font-normal normal-case">Automatic</span> : null}
                {line.done ? <span aria-hidden="true">✓</span> : null}
                {line.done ? <span className="sr-only">Recorded</span> : null}
              </Button>
              {automatic && !line.done ? (
                <IconButton action="close" label={`Dismiss: ${line.script}`} size="sm" onClick={() => void session.dismiss(line.id)} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </SideSection>
  );
}

const SessionContext = createContext<PickupSessionModel | null>(null);

/** The page gives its session (`usePickupSession`) to the registered section through this. */
export const PickupSessionProvider = SessionContext.Provider;

function PickupSessionSection() {
  const session = useContext(SessionContext);
  return session ? <PickupSession session={session} /> : null;
}

/** Adds the list to the Booth side panel, ahead of its other sections: in a session the lines come first. Called once by the page. */
export function registerPickupSession(): void {
  registerBoothSection('pickups', PickupSessionSection, 5);
}
