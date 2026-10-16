import { useCallback, useState } from 'react';
import { DeliveryProfilePanel } from '../../master/DeliveryProfilePanel';
import { creditsEntries } from '../../credits/creditsEntries';
import { useCreditsRows } from '../../credits/useCreditsRows';
import { NeedManuscript } from '../../layout/NeedManuscript';
import { Heading } from '../../primitives/Heading';
import type { DeliveryProfile } from '../../../types';
import { ProfileCard } from '../profile/ProfileCard';
import { chapterStates, listedChapters, readiness } from './chapterStates';
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
  // Bumped by Check again, so the credits are read again with the chapters and the measurement.
  const [creditsRead, setCreditsRead] = useState(0);
  const build = useDeliveryBuild(profile);
  // The credits files are deliverables: the opening before chapter 1, the closing after the last, judged like a chapter. Nothing is judged
  // until they have been read, or the page would say "Every chapter passes" and then add two rows that do not. Delivery changes no
  // credits status, so the call's own error handler has nothing to report.
  const credits = useCreditsRows(String(creditsRead), () => undefined);

  const onProfile = useCallback((next: DeliveryProfile) => setProfile(next), []);
  // A profile change or edit drops the built list; a new build shows it again.
  const onChange = useCallback(() => setBuilt(false), []);
  const start = async () => {
    setBuilt(true);
    await build.build();
  };

  const { chapters, job } = checks;
  // Nothing is judged until the chapters, the credits and the measurement have each been read.
  const known = chapters !== undefined && job !== undefined && credits.rows !== undefined;
  const entries = creditsEntries(
    credits.rows,
    (chapters ?? []).some((chapter) => chapter.contentKind === 'opening'),
  );
  const states = known ? chapterStates(listedChapters(chapters, entries), job.files) : [];
  const { ready, text } = known ? readiness(states) : { ready: false, text: "Can't tell which chapters pass yet." };
  const measuring = job?.phase === 'running' ? job : undefined;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* The mock's page title, "Delivery": the page heading every page opens with. */}
        <Heading title="Delivery" />
        <ProfileCard onChange={onChange} onProfile={onProfile} />
        {profile && (
          <OutputPanel
            profile={profile}
            ready={ready && !measuring}
            waiting={measuring ? 'Measuring the files in Master & QC.' : text}
            build={{ ...build, build: start }}
            showBuilt={built}
          />
        )}
        {profile && <DeliveryProfilePanel profile={profile} />}
      </div>
      <Preflight
        states={states}
        known={known}
        measuring={measuring}
        problem={checks.jobError ?? checks.chaptersError ?? (credits.failure && `The credits could not be read: ${credits.failure}`)}
        lastHeard={checks.lastHeard}
        onCheckAgain={() => {
          setCreditsRead((count) => count + 1);
          checks.checkAgain();
        }}
        onOpen={onOpenInMaster}
        onOpenMaster={onOpenMaster}
      />
    </div>
  );
}
