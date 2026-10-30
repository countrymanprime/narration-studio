import { useCallback, useMemo, useState } from 'react';
import { DeliveryProfilePanel } from '../../master/DeliveryProfilePanel';
import { NeedManuscript } from '../../layout/NeedManuscript';
import { useOpenPickups } from '../../pickups/useOpenPickups';
import type { DeliveryProfile } from '../../../types';
import { ProfileCard } from '../profile/ProfileCard';
import { chapterStates, firstFailure, firstNotReady, readiness } from './chapterStates';
import { OutputPanel } from './OutputPanel';
import { Preflight } from './Preflight';
import { useDeliveryBuild } from './useDeliveryBuild';
import { useDeliveryChecks } from './useDeliveryChecks';

/**
 * Delivery (the Studio Next mock's page): the profile card, the Output panel and the "Before you build" aside. Chapters are judged by the
 * host's measurement (`measureState`) against the project's profile; the build runs over the export and package jobs. The profile's
 * rules and their sources have no mock equivalent and stay as built, below Output. The page navigates by callback only.
 */
export function DeliveryPage({
  hasManuscript,
  onOpenInMaster,
  onOpenMaster,
  onImport,
}: {
  hasManuscript: boolean;
  /** Opens a chapter's file in Master & QC. */
  onOpenInMaster: (chapterId: string) => void;
  /** Opens Master & QC itself, on no file. */
  onOpenMaster?: () => void;
  /** Goes to the import, from the need-a-manuscript state. */
  onImport?: () => void;
}) {
  if (!hasManuscript) return <NeedManuscript title="Delivery" onImport={onImport} />;
  return <LoadedDelivery onOpenInMaster={onOpenInMaster} onOpenMaster={onOpenMaster} />;
}

function LoadedDelivery({ onOpenInMaster, onOpenMaster }: { onOpenInMaster: (chapterId: string) => void; onOpenMaster?: () => void }) {
  const checks = useDeliveryChecks();
  const [profile, setProfile] = useState<DeliveryProfile>();
  const [built, setBuilt] = useState(true);
  const build = useDeliveryBuild(profile);

  const onProfile = useCallback((next: DeliveryProfile) => setProfile(next), []);
  // A profile change or edit drops the built list; a new build shows it again.
  // The host judges the measurement against the profile as it is now, so it is read again too.
  const { reread } = checks;
  const onChange = useCallback(() => {
    setBuilt(false);
    reread();
  }, [reread]);
  const start = async () => {
    setBuilt(true);
    await build.build();
  };

  const { chapters, job } = checks;
  // Nothing is judged until the chapters and the measurement have each been read. The credits are chapters: the opening first, the closing
  // last, each judged by its measured file ("Opening credits.wav") like any other.
  const known = chapters !== undefined && job !== undefined;
  const listed = known ? chapters : [];
  // Open pickup lines per chapter, as Production's pipeline counts them; nothing is claimed until the list is read.
  const openLines = useOpenPickups();
  const pickups = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const line of openLines ?? []) counts[line.chapterId] = (counts[line.chapterId] ?? 0) + 1;
    return counts;
  }, [openLines]);
  const states = known ? chapterStates(listed, job.files, openLines ? pickups : undefined) : [];
  const failure = known && profile ? (firstFailure(listed, job.files, profile) ?? firstNotReady(listed, job.files)) : undefined;
  const { ready, text } = known ? readiness(states) : { ready: false, text: "Can't tell which chapters pass yet." };
  const measuring = job?.phase === 'running' ? job : undefined;
  return (
    /* Master & QC's centred 96 rem column, so a wide window does not set a label 1,262 px from its value (R3DL-1); one `minmax(0,1fr)`
       track at every width, so a long row never pushes a card past the window (XDL-11). The cards are siblings in one grid: side by side
       the aside spans the left column's rows and ends where its list ends (XDL-4, XDL-12); in one column it comes straight after Output,
       next to the Build button its counts explain, before Profile rules (XDL-6). */
    <div className="mx-auto grid max-w-[96rem] grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:grid-rows-[auto_auto_1fr]">
      <div className="min-w-0 lg:col-start-1">
        <ProfileCard onChange={onChange} onProfile={onProfile} locked={build.running || build.starting} />
      </div>
      <div className="min-w-0 empty:hidden lg:col-start-1">
        {profile && (
          <OutputPanel
            profile={profile}
            ready={ready && !measuring}
            waiting={measuring ? 'Measuring the files in Master & QC.' : text}
            failure={measuring ? undefined : failure}
            build={{ ...build, build: start }}
            showBuilt={built}
            onOpenMaster={onOpenMaster}
          />
        )}
      </div>
      <div className="min-w-0 lg:col-start-2 lg:row-span-3 lg:row-start-1">
        <Preflight
          states={states}
          known={known}
          measuring={measuring}
          problem={checks.jobError ?? checks.chaptersError}
          lastHeard={checks.lastHeard}
          onCheckAgain={checks.checkAgain}
          onOpen={onOpenInMaster}
          onOpenMaster={onOpenMaster}
        />
      </div>
      {profile && (
        <div className="min-w-0 lg:col-start-1">
          <DeliveryProfilePanel profile={profile} />
        </div>
      )}
    </div>
  );
}
