import { SuspectedLines } from '../suspected/SuspectedLines';
import { ComingUp } from './ComingUp';
import { Reference } from './Reference';
import { registerBoothSection } from './sections';
import { LastPunch, SessionNumbers } from './SessionNumbers';
import { VoicesNearby } from './VoicesNearby';

// The panel's own sections, in the mock's order. A pickup or bookmark section registers from its own file with an `order` between these.
registerBoothSection('reference', ({ data }) => <Reference reference={data.reference} onOpenEntry={data.onOpenEntry} />, 10);
registerBoothSection('suspected', ({ data }) => <SuspectedLines chapterId={data.chapterId} flags={data.flags} />, 30);
registerBoothSection('last-punch', ({ data }) => <LastPunch numbers={data.numbers} />, 40);
registerBoothSection('voices', ({ data }) => <VoicesNearby voices={data.voices} />, 50);
registerBoothSection('coming-up', ({ data }) => <ComingUp words={data.comingUp} />, 60);
registerBoothSection('numbers', ({ data }) => <SessionNumbers numbers={data.numbers} />, 70);
