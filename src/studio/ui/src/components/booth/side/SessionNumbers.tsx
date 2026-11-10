import type { SessionNumbersData } from './sections';
import { SideSection } from './SideSection';

const mmss = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

/** The last punch and where the next roll starts; the mock puts it above the voices. */
export function LastPunch({ numbers }: { numbers: SessionNumbersData }) {
  return (
    <SideSection title="Last punch">
      <div>{numbers.lastPunch ?? 'No punches yet'}</div>
    </SideSection>
  );
}

/** This session's recorded time and punch count. */
export function SessionNumbers({ numbers }: { numbers: SessionNumbersData }) {
  return (
    <SideSection title="This session">
      <div>
        Recorded <b className="font-mono">{mmss(numbers.recordedSeconds)}</b> · {numbers.punches} {numbers.punches === 1 ? 'punch' : 'punches'}
      </div>
    </SideSection>
  );
}
