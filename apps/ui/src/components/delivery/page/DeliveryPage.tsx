import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { DeliveryProfilePanel } from '../../master/DeliveryProfilePanel';
import { NeedManuscript } from '../../layout/NeedManuscript';
import { Heading } from '../../primitives/Heading';
import type { DeliveryProfile, ManuscriptChapter, MeasureFileResult } from '../../../types';
import { ProfileCard } from '../profile/ProfileCard';
import { chapterStates, readiness } from './chapterStates';
import { OutputPanel } from './OutputPanel';
import { Preflight } from './Preflight';
import { useBuildPackage } from './useBuildPackage';

/**
 * Delivery (the Studio Next mock's page): the profile card, the Output panel and the "Before you build" aside. Chapters are judged by the
 * host's measurement (`measureState`) against the project's profile; the build runs over the export and package jobs. The profile's
 * rules and their sources have no mock equivalent and stay as built, below Output. The page navigates by callback only.
 */
export function DeliveryPage({
  hasManuscript,
  onOpenInMaster,
  onImport,
}: {
  hasManuscript: boolean;
  onOpenInMaster: (chapterId: string) => void;
  /** Goes to the import, from the need-a-manuscript state. */
  onImport?: () => void;
}) {
  const manuscript = usePort('manuscript');
  const measure = usePort('measure');
  const [chapters, setChapters] = useState<ManuscriptChapter[]>([]);
  const [files, setFiles] = useState<MeasureFileResult[]>([]);
  const [problem, setProblem] = useState<string>();
  const [profile, setProfile] = useState<DeliveryProfile>();
  const [built, setBuilt] = useState(true);
  const build = useBuildPackage(profile);

  useEffect(() => {
    if (!hasManuscript) return;
    let live = true;
    Promise.all([manuscript.manuscriptChapters(), measure.measureState()])
      .then(([list, job]) => {
        if (!live) return;
        setChapters(list);
        setFiles(job.files);
      })
      .catch((failure) => live && setProblem(`The chapters could not be checked: ${apiErrorMessage(failure)}`));
    return () => {
      live = false;
    };
  }, [hasManuscript, manuscript, measure]);

  const onProfile = useCallback((next: DeliveryProfile) => setProfile(next), []);
  // A profile change or edit drops the built list; a new build shows it again.
  const onChange = useCallback(() => setBuilt(false), []);
  const start = () => {
    setBuilt(true);
    build.build();
  };

  if (!hasManuscript) return <NeedManuscript title="Delivery" onImport={onImport} />;

  const states = chapterStates(chapters, files);
  const { ready, text } = readiness(states);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {/* The mock's page title, "Delivery": the page heading every page opens with. */}
        <Heading title="Delivery" />
        <ProfileCard onChange={onChange} onProfile={onProfile} />
        {profile && <OutputPanel profile={profile} ready={ready} waiting={text} build={{ ...build, build: start }} showBuilt={built} />}
        {profile && <DeliveryProfilePanel profile={profile} />}
        {problem && (
          <p role="alert" className="text-sm" style={{ color: 'var(--danger-text)' }}>
            {problem}
          </p>
        )}
      </div>
      <Preflight states={states} onOpen={onOpenInMaster} />
    </div>
  );
}
