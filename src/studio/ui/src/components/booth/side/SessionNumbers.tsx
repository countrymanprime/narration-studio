import type { SessionNumbersData } from './sections';
import { DIM_CLASS, SideSection } from './SideSection';
import { clock } from '../../../clock';

/** The last punch and where the next roll starts; the mock puts it above the voices. */
export function LastPunch({ numbers }: { numbers: SessionNumbersData }) {
  return (
    <SideSection title="Last punch">
      <div>{numbers.lastPunch ?? 'No punches yet'}</div>
      {numbers.nextRoll ? <div className={DIM_CLASS}>{numbers.nextRoll}</div> : null}
    </SideSection>
  );
}

/** This session's recorded time and punch count. */
export function SessionNumbers({ numbers }: { numbers: SessionNumbersData }) {
  return (
    <SideSection title="This session">
      <div>
        Recorded <b className="font-mono">{clock(numbers.recordedSeconds, { minuteDigits: 2 })}</b> · {numbers.punches}{' '}
        {numbers.punches === 1 ? 'punch' : 'punches'}
      </div>
    </SideSection>
  );
}
