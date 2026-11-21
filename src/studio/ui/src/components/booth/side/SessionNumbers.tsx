import type { SessionNumbersData } from './sections';
import { SideSection } from './SideSection';
import { clock } from '../../../clock';
import { pluralWord } from '../../../plural';

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
        Recorded <b className="font-mono">{clock(numbers.recordedSeconds, { minuteDigits: 2 })}</b> · {numbers.punches}{' '}
        {pluralWord(numbers.punches, 'punch', 'punches')}
      </div>
    </SideSection>
  );
}
