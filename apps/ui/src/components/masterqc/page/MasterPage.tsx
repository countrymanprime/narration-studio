import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { chapterName } from '../../../chapterName';
import type { DeliveryProfile, ManuscriptChapter } from '../../../types';
import { creditsEntries, ownsOpeningCredits } from '../../credits/creditsEntries';
import { useCreditsRows } from '../../credits/useCreditsRows';
import { listedChapters } from '../../delivery/page/chapterStates';
import { chapterOfFile, fileOf } from '../../master/chapterFile';
import { deliveryProfileKey } from '../../master/deliveryProfile';
import { DiagnosticsSection } from '../../master/DiagnosticsSection';
import { FileRulesPanel } from '../../master/FileRulesPanel';
import { MasteringChain, useMasteringProviders } from '../../master/MasteringChain';
import { MasterToSpecPanel } from '../../master/MasterToSpecPanel';
import { MultiPlatformExportPanel } from '../../master/MultiPlatformExportPanel';
import { ReportExportPanel } from '../../master/ReportExportPanel';
import { useExportJobs } from '../../master/useExportJobs';
import { Button } from '../../primitives/Button';
import { ChapterStepper } from '../../primitives/ChapterStepper';
import { HeaderChip } from '../../primitives/HeaderChip';
import { Heading } from '../../primitives/Heading';
import { Panel } from '../../primitives/Panel';
import { useOpenPickups } from '../../pickups/useOpenPickups';
import { NeedManuscript } from '../../layout/NeedManuscript';
import type { FileActions } from '../files/FileActions';
import { FileChecks } from '../files/FileChecks';
import { FilesTable } from '../files/FilesTable';
import { buildChapterRows } from '../files/rows';
import { Consistency } from './Consistency';
import { MeasureControls, MeasureProgress, useMeasureRun } from './MeasureRun';
import { PackageChecks } from './PackageChecks';
import { profileName } from './packageItems';
import { saveSharedChapter } from './sharedChapter';
import { useFileActions } from './useFileActions';

const MUTED = { color: 'var(--text-muted)' };
const DANGER = { color: 'var(--danger-text)' };

/**
 * Master & QC (the Studio Next mock's Master page, at `/master`): the chapter bar over the per-file checks (selecting a file moves the
 * shared chapter and the bar follows; without a manuscript the page asks for one), the per-file checks and their detail, the book's consistency
 * against the profile, and the delivery package beside them. The profile pill and "Open Delivery" call `onOpenDelivery`; this page
 * navigates nowhere itself. The run controls, a file's every-rule list, mastering to spec, the mastering chain, the diagnostics, the
 * multi-platform export and the report export have no equivalent in the mock (D98) and stay as built, beside its sections. Playing a stretch of a file
 * and opening it in the DAW go to the DAW port (`useFileActions`) unless the caller gives its own (`fileActions`).
 */
export function MasterPage({
  hasManuscript = true,
  projectFolder = '',
  onImport = () => undefined,
  ...rest
}: {
  /** False shows the manuscript gate instead of the page. */
  hasManuscript?: boolean;
  /** Keys the shared chapter (`sharedChapter.ts`). */
  projectFolder?: string;
  /** The manuscript gate's "Import manuscript". */
  onImport?: () => void;
} & BodyProps) {
  if (!hasManuscript) return <NeedManuscript title="Master & QC" onImport={onImport} />;
  return <MasterBody projectFolder={projectFolder} {...rest} />;
}

type BodyProps = {
  onOpenDelivery: () => void;
  openSettings: () => void;
  /** What a link names (`masterLink.ts`): a file's path, or the id of a chapter (Delivery's chapter links). The table opens on that file, else the first failing file. */
  focusFile?: string;
  fileActions?: Pick<FileActions, 'onPlayQuietest' | 'onOpenInDaw'>;
};

const isNarration = (chapter: ManuscriptChapter) => (chapter.contentKind ?? 'narration') === 'narration';

function MasterBody({ projectFolder, onOpenDelivery, openSettings, fileActions, focusFile }: BodyProps & { projectFolder: string }) {
  const manuscript = usePort('manuscript');
  const [chapters, setChapters] = useState<ManuscriptChapter[]>([]);
  const [chaptersProblem, setChaptersProblem] = useState<string>();
  const [chaptersRead, setChaptersRead] = useState(false);
  const profilesPort = usePort('deliveryProfiles');
  const run = useMeasureRun();
  // The credits files count toward the package like a chapter, as Delivery's list counts them, so the two pages say the same number.
  const creditRows = useCreditsRows('master', () => undefined);
  const credits = useMemo(() => creditsEntries(creditRows.rows, ownsOpeningCredits(chapters)), [creditRows.rows, chapters]);
  const jobs = useExportJobs();
  const mastering = useMasteringProviders();
  const [all, setAll] = useState<DeliveryProfile[]>([]);
  const [chosen, setChosen] = useState<DeliveryProfile>();
  const [profileProblem, setProfileProblem] = useState<string>();
  // Whether that problem is a read that failed (Retry reads again) or a profile the project names that the list lacks (reading again would not change it).
  const [profileReadFailed, setProfileReadFailed] = useState(false);
  // Retry counters: each failed read's Retry clears its line and bumps one, so the effect reads again and the package panel shows its skeleton.
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [chaptersAttempt, setChaptersAttempt] = useState(0);
  // A file's path, or a chapter's id when that chapter has no file yet. The chapter bar is read off it.
  const [picked, setPicked] = useState<string | undefined>(focusFile);
  // A link that arrives while the page is open (the narrator follows another one) moves the selection too.
  useEffect(() => {
    if (focusFile !== undefined) setPicked(focusFile);
  }, [focusFile]);
  // The file whose every-rule list the narrator closed; selecting another file shows its list again.
  const [rulesClosed, setRulesClosed] = useState<string>();

  useEffect(() => {
    let active = true;
    profilesPort.deliveryProfiles().then(
      (state) => {
        if (!active) return;
        setAll(state.profiles);
        const found = state.profiles.find((candidate) => deliveryProfileKey(candidate) === state.projectProfile);
        if (found) setChosen(found);
        else setProfileProblem(`the profile ${state.projectProfile} is not in the list`);
      },
      (error) => {
        if (!active) return;
        setProfileProblem(apiErrorMessage(error));
        setProfileReadFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [profilesPort, profileAttempt]);
  const retryProfile = () => {
    setProfileProblem(undefined);
    setProfileReadFailed(false);
    setProfileAttempt((n) => n + 1);
  };

  useEffect(() => {
    let live = true;
    manuscript.manuscriptChapters().then(
      (list) => live && (setChapters(list), setChaptersRead(true)),
      (error) => live && (setChaptersProblem(apiErrorMessage(error)), setChaptersRead(true)),
    );
    return () => {
      live = false;
    };
  }, [manuscript, chaptersAttempt]);
  const retryChapters = () => {
    setChaptersProblem(undefined);
    setChaptersRead(false);
    setChaptersAttempt((n) => n + 1);
  };

  // The profile a measurement was judged against wins over the project's current choice until it is measured again.
  const profile = run.job?.profile ?? chosen;
  // One row per chapter, the credits and the retail sample, with a file or without; the open pickups come from the Pickups page's own list.
  const openLines = useOpenPickups();
  const openPickups = useMemo(() => {
    if (!openLines) return undefined;
    const counts: Record<string, number> = {};
    for (const line of openLines) counts[line.chapterId] = (counts[line.chapterId] ?? 0) + 1;
    return counts;
  }, [openLines]);
  const slots = useMemo(() => listedChapters(chapters, credits), [chapters, credits]);
  const rows = useMemo(() => (profile ? buildChapterRows(run.files, profile, slots, openPickups) : []), [run.files, profile, slots, openPickups]);
  // A link by chapter id lands on that chapter's file once the files are known.
  const selected = useMemo(() => {
    const chapter = chapters.find((candidate) => candidate.id === picked);
    return (chapter && fileOf(chapter, run.files)?.path) ?? picked;
  }, [picked, chapters, run.files]);
  const current = rows.find((row) => row.id === selected);
  // A link that names neither a file of this check nor a chapter (a stale or mistyped address) is said so, with a way out; it is never
  // drawn as an empty "Not mastered" panel. Judged only once the files and the chapter list are both known.
  const staleLink =
    picked !== undefined &&
    run.lastHeard !== undefined &&
    !run.running &&
    chaptersRead &&
    !chaptersProblem &&
    !current &&
    !chapters.some((chapter) => chapter.id === picked)
      ? picked
      : undefined;
  const chapterOfSelection = useMemo(() => {
    const file = run.files.find((candidate) => candidate.path === selected);
    return (file && chapterOfFile(file, chapters)) ?? chapters.find((candidate) => candidate.id === selected);
  }, [selected, run.files, chapters]);
  const remember = useCallback((chapter: ManuscriptChapter | undefined) => chapter && saveSharedChapter(projectFolder, chapter.id), [projectFolder]);
  const select = useCallback(
    (id: string) => {
      setPicked(id);
      const file = run.files.find((candidate) => candidate.path === id);
      remember(file ? chapterOfFile(file, chapters) : chapters.find((candidate) => candidate.id === id));
    },
    [run.files, chapters, remember],
  );
  const bar = useMemo(() => chapters.filter(isNarration).map((chapter) => ({ id: chapter.id, name: chapterName(chapter) })), [chapters]);
  const goToChapter = (id: string) => {
    const chapter = chapters.find((candidate) => candidate.id === id);
    if (!chapter) return;
    setPicked(fileOf(chapter, run.files)?.path ?? chapter.id);
    remember(chapter);
  };
  const stepChapter = (direction: -1 | 1) => {
    const next = bar[bar.findIndex((candidate) => candidate.id === chapterOfSelection?.id) + direction];
    if (next) goToChapter(next.id);
  };
  const currentFile = run.files.find((file) => file.path === selected && file.status === 'measured');
  const chain = mastering.providers?.providers.find((row) => row.name === mastering.providers?.effective);
  const actions: FileActions = {
    ...useFileActions(),
    ...fileActions,
    onRecheck: () => void run.check(),
  };

  return (
    <div className="mx-auto max-w-[96rem]">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,22.4rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* The mock's header row lives in the table's panel: the title, the chapter bar, the profile as a pill, then the refresh icon. The
              run controls and Master to spec have no equivalent in the mock and stay as built, beside the icon. */}
          {(() => {
            const heading = (
              <>
                <Heading title="Master & QC" />
                {bar.length > 0 && chapterOfSelection && (
                  <ChapterStepper chapters={bar} value={chapterOfSelection.id} stepKeys={['Alt+↑', 'Alt+↓']} onChange={goToChapter} onStep={stepChapter} />
                )}
                {profile && (
                  <HeaderChip title="Open Delivery" onClick={onOpenDelivery}>
                    {profileName(profile)}
                  </HeaderChip>
                )}
              </>
            );
            const controls = (
              <>
                {/* Opens Master to spec below (no mock equivalent, kept as built). */}
                <Button variant="secondary" onClick={() => void jobs.pick()} pending={jobs.picking} disabled={jobs.exportRunning}>
                  Master all to spec…
                </Button>
                <MeasureControls run={run} />
              </>
            );
            // One element either way, so the header's buttons survive the profile and the chapters arriving.
            return (
              <FilesTable
                files={run.files}
                profile={profile && chaptersRead ? profile : undefined}
                slots={slots}
                openPickups={openPickups}
                heading={heading}
                controls={controls}
                selected={selected}
                onSelect={select}
                actions={actions}
              />
            );
          })()}
          {profileProblem && (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-sm" style={DANGER}>
                The delivery profile could not be read: {profileProblem}
              </p>
              {profileReadFailed && (
                <Button variant="secondary" size="sm" aria-label="Retry reading the delivery profile" onClick={retryProfile}>
                  Retry
                </Button>
              )}
            </div>
          )}
          {chaptersProblem && (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-sm" style={DANGER}>
                The chapters could not be read, so the files keep their file names: {chaptersProblem}
              </p>
              <Button variant="secondary" size="sm" aria-label="Retry reading the chapters" onClick={retryChapters}>
                Retry
              </Button>
            </div>
          )}
          {staleLink !== undefined && (
            <div role="status" aria-label="Link not found" className="flex flex-wrap items-center gap-2 text-sm" style={MUTED}>
              <span>
                {run.files.length === 0
                  ? `The link names ${staleLink}, but no files are measured yet. Check files to measure them.`
                  : `The link names ${staleLink}, which this check does not include. It may have been renamed, moved or not measured yet.`}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setPicked(undefined)}>
                Show the first file instead
              </Button>
            </div>
          )}
          <MeasureProgress run={run} />
          {profile && chaptersRead && (
            <>
              {staleLink === undefined && (current || run.files.length > 0) && (
                <FileChecks row={current} chapterLabel={chapterOfSelection && chapterName(chapterOfSelection)} actions={actions} />
              )}
              {currentFile && rulesClosed !== currentFile.path && (
                <FileRulesPanel file={currentFile} profile={profile} onClose={() => setRulesClosed(currentFile.path)} />
              )}
            </>
          )}
          {run.files.length === 0 && !run.running && (
            <p className="text-sm" style={MUTED}>
              Nothing measured yet. Check your rendered chapter files (WAV) to see them here.
            </p>
          )}
          <Panel title="Book consistency" subtitle={profile ? `RMS by file against the ${profileName(profile)} range` : undefined}>
            <Consistency files={run.files} profile={profile} />
          </Panel>
          <MasterToSpecPanel jobs={jobs} chainLabel={chain?.label} />
          <MasteringChain providers={mastering.providers} problem={mastering.problem} />
          <DiagnosticsSection measuredPaths={run.paths} openSettings={openSettings} />
          <ReportExportPanel busy={run.running} measured={run.files.length > 0} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <PackageChecks
            profile={profile}
            chapters={chapters}
            credits={credits}
            files={run.files}
            loading={!chaptersRead || (!profile && !profileProblem)}
            onOpenDelivery={onOpenDelivery}
          />
          <MultiPlatformExportPanel profiles={all} jobs={jobs} />
        </div>
      </div>
    </div>
  );
}
