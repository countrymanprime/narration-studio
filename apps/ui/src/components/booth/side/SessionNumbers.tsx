import type { SessionNumbersData } from './sections';
import { DIM_CLASS, SideSection } from './SideSection';

const mmss = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

/** The last punch and this session's recorded time and punch count. */
export function SessionNumbers({ numbers }: { numbers: SessionNumbersData }) {
  return (
    <>
      <SideSection title="Last punch">
        <div className="text-sm">{numbers.lastPunch ?? 'No punches yet'}</div>
        {numbers.nextRoll ? <div className={DIM_CLASS}>{numbers.nextRoll}</div> : null}
      </SideSection>
      <SideSection title="This session">
        <div className="text-sm">
          Recorded <b className="font-mono">{mmss(numbers.recordedSeconds)}</b> · {numbers.punches} {numbers.punches === 1 ? 'punch' : 'punches'}
        </div>
      </SideSection>
    </>
  );
}
