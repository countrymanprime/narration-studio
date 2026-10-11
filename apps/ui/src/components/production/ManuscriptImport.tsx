import { apiErrorMessage, describeApiError } from '../../api/errorMessage';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useApi } from '../../api/ApiContext';
import { usePendingAction } from '../../hooks/usePendingAction';
import { useWorkJob } from '../../hooks/useWorkJob';
import type { CreditsSetupState, DeliveryProfilesState, ManuscriptImportSelection, WorkJob } from '../../types';
import type { Bootstrap } from '../../types';
import { CreditsSetupBanner } from '../credits/CreditsSetupBanner';
import { CreditsSetupDialog } from '../credits/CreditsSetupDialog';
import { NEUTRAL_PROFILE, PLATFORM_PROFILES } from '../schedule/profiles';
import { Button } from '../primitives/Button';
import { ImportReview, ImportSummary } from './ImportReview';
import { subtitleOverridesToCommit, type ReviewGroupKey, type ReviewGroupOpen } from './importReviewModel';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { WorkDialog } from '../primitives/WorkDialog';
import { TooltipTarget } from '../primitives/Tooltip';
import type { Notify } from '../primitives/Toast';

// Import runs as a host-side job; the UI only ever displays the percent and log
// lines the host reports while polling (ADR-0015) - it never invents progress.
const IMPORT_POLL_MS = 200;
// Candidate manuscripts the user has said no to. Module scope, not storage, so a
// declined offer stays quiet for the rest of the session and is offered again
// the next time the app starts (ADR-0019).
const declinedCandidates = new Set<string>();
const IMPORT_POLLED_PHASES: WorkJob['phase'][] = ['preparing', 'committing'];

/**
 * The manuscript import and the credits prompt (the import
 * flow and the manuscript candidate offer are the Production page's empty state). A hook, not a component, so the Production home can put the
 * choose-a-file button in its empty state or its header while the dialogs stay mounted in one place: an import that finishes turns
 * the empty state into the board, and must not lose the job it is following when it does.
 */
export function useManuscriptImport({
  data,
  go,
  notify,
  refreshBootstrap,
}: {
  data: Bootstrap;
  go: (page: string) => void;
  notify: Notify;
  refreshBootstrap: () => Promise<void>;
}): { chooseButton: ReactNode; dialogs: ReactNode; creditsBanner: ReactNode } {
  const api = useApi();
  const found = Boolean(data.manuscript);
  // The import's own job is polled while the host prepares or commits it; its success stays set, for the effect below to act on once.
  const [importJob, setImportJob] = useWorkJob({
    poll: (job) => api.manuscriptImportState(job.id!),
    pollingPhases: IMPORT_POLLED_PHASES,
    intervalMs: IMPORT_POLL_MS,
  });
  // The file dialog is the host's, and pressing again while it is open would open a second one (ADR 0075).
  const choosing = usePendingAction();
  const [importSelection, setImportSelection] = useState<ManuscriptImportSelection>({});
  // Which review groups the narrator opened or closed by hand. It lives here, above the review dialog, which is swapped for a progress
  // dialog while a Markdown heading level is read again, and is reset only when a new file is chosen (a group has its own default until then).
  const [groupOpen, setGroupOpen] = useState<ReviewGroupOpen>({});
  const [headingLevel, setHeadingLevel] = useState(1);
  const [, setDeclineCount] = useState(0);
  // "Build the Story Bible after import", pre-filled from Settings (ManuscriptGuide.build_after_import, on by
  // default) and changeable per import. buildStarted guards against starting the chained build
  // twice for the same import job (the poller can report 'success' more than once before its interval is cleared).
  const [buildAfterImport, setBuildAfterImport] = useState(true);
  // The chained build is followed like the Story Bible page follows its own (the same hook), and its dialog clears the moment the host
  // reports success rather than waiting for a click: the app's job:ended subscriber already raises the "Story Bible rebuild complete"
  // toast (ADR 0076), so this dialog does not also announce it.
  const [buildAfterImportJob, setBuildAfterImportJob] = useWorkJob({ poll: () => api.guideBuildState(), onSuccess: () => undefined });
  const buildStarted = useRef(false);
  // The delivery profile is asked for on a first import of a project with none chosen, never on a replace (SNM-Q1). The host's profile
  // state is read when a review opens; `profileToSave` holds the choice from the commit until the import has succeeded.
  const [profiles, setProfiles] = useState<DeliveryProfilesState>();
  const [profileChoice, setProfileChoice] = useState(NEUTRAL_PROFILE);
  const profileToSave = useRef<string | null>(null);
  const asksProfile = !found && profiles !== undefined && profiles.projectChoice === null;
  useEffect(() => {
    void api
      .settingsForScope('global')
      .then((settings) => {
        const field = settings.ManuscriptGuide?.find((item) => item.key === 'build_after_import');
        if (field) setBuildAfterImport(field.effectiveValue !== 'false');
      })
      .catch(() => {});
  }, [api]);
  const reviewing = importJob?.phase === 'ready';
  useEffect(() => {
    if (!reviewing || found) return;
    void api
      .deliveryProfiles()
      .then((state) => {
        setProfiles(state);
        // Starts on the Global default when the table lists it, else on none: always a value, so the review can be committed.
        setProfileChoice(PLATFORM_PROFILES.some((profile) => profile.id === state.globalDefault.id) ? state.globalDefault.id : NEUTRAL_PROFILE);
      })
      .catch(() => setProfiles(undefined));
  }, [api, reviewing, found]);
  const candidate = data.manuscriptCandidate;
  const offerCandidate = !found && candidate && !declinedCandidates.has(candidate.path) && !importJob;
  // The "Set up the credits" prompt: CreditsSetupState
  // is not part of Bootstrap, so it is read here, keyed on the same manuscript identity as the effect below - it is
  // re-read on first load, after an import commits (data.manuscript?.importedAt changes once refreshBootstrap runs) and
  // after Replace manuscript (a new documentId). Whether to show it (`needed`) is answered entirely by the host.
  const [creditsSetup, setCreditsSetup] = useState<CreditsSetupState>();
  // "Fill in" on the banner forces the dialog open even though `needed` is false (the narrator already said
  // "Not now" or "Don't ask", or only some tokens remain), independent of the auto-open condition below.
  const [fillingInCredits, setFillingInCredits] = useState(false);
  useEffect(() => {
    void api
      .creditsSetupState()
      .then(setCreditsSetup)
      .catch(() => setCreditsSetup(undefined));
  }, [api, data.manuscript?.id, data.manuscript?.importedAt]);
  // The host finishes writing the manuscript before it reports success, so the shared application state is refreshed
  // exactly once, on that transition. A checked "Build the Story Bible after import" chains straight into
  // api.guideBuild() (B3, UI-chained for the MVP: no binding change, and a build failure never unmakes the import,
  // which is already written and reported). The import dialog closes itself (like a successful Story Bible rebuild
  // already does, ADR 0076) and a second WorkDialog picks up the build's own progress, its own toast on the app's job:ended
  // subscriber included.
  // The choice is saved once, after the import is written; a refusal is said in the host's words and never undoes the import.
  const saveProfile = useCallback(async () => {
    const id = profileToSave.current;
    profileToSave.current = null;
    // A platform the host has no profile for ("Other / none") leaves the project on the Global default.
    const profile = id === null ? undefined : profiles?.profiles.find((candidate) => candidate.id === id);
    if (!profile) return;
    try {
      await api.deliverySelectProfile('project', profile.id, profile.builtIn ? profile.version : '');
    } catch (error) {
      notify(`Manuscript imported. The delivery profile was not saved: ${apiErrorMessage(error)}`, 'error');
    }
  }, [api, notify, profiles]);
  useEffect(() => {
    if (importJob?.phase !== 'success') return;
    void refreshBootstrap();
    void saveProfile();
    if (!buildAfterImport || buildStarted.current) return;
    buildStarted.current = true;
    notify('Manuscript imported.');
    setImportJob(undefined);
    void api
      .guideBuild({})
      .then((result) => {
        if (result.status === 'asset_required') {
          notify('Manuscript imported. Build the Story Bible from the Story Bible page to download its language model first.');
          return;
        }
        if (result.job.phase !== 'success') setBuildAfterImportJob(result.job);
      })
      .catch((error) => notify(`Manuscript imported. Story Bible build failed: ${apiErrorMessage(error)}`, 'error'));
  }, [importJob?.phase, buildAfterImport, api, notify, refreshBootstrap, saveProfile, setImportJob, setBuildAfterImportJob]);
  const beginImportPreview = async (jobId: string) => {
    setHeadingLevel(1);
    setImportSelection({});
    setGroupOpen({});
    buildStarted.current = false;
    setBuildAfterImportJob(undefined);
    setImportJob({ id: jobId, kind: 'manuscript_import', phase: 'preparing', message: 'Preparing manuscript import…', percent: 0, logs: [], elapsed: 0 });
    try {
      setImportJob(await api.manuscriptImportPreview(jobId, { markdownHeadingLevel: 1 }));
    } catch (error) {
      const message = apiErrorMessage(error);
      setImportJob((current) => (current ? { ...current, phase: 'error', error: message, message } : current));
    }
  };
  // Another Markdown heading level means other sections, so the choices made for the old ones are dropped and the host reads the file again.
  const changeHeadingLevel = (level: number) => {
    setHeadingLevel(level);
    setImportSelection({});
    void api
      .manuscriptImportPreview(importJob!.id!, { markdownHeadingLevel: level })
      .then(setImportJob)
      .catch((error) => notify(error.message, 'error'));
  };
  const commitImport = async () => {
    if (!importJob?.id) return;
    profileToSave.current = asksProfile ? profileChoice : null;
    try {
      const selectedCharacterCandidateIds =
        importSelection.characterCandidateIds ?? importJob.preview?.characterCandidates?.map((candidate) => candidate.id) ?? [];
      // Returns at once: the job is 'committing' and polling shows its real
      // stages, or it is still 'ready' with requiresReset asking for a confirm.
      setImportJob(
        await api.manuscriptImportCommit(importJob.id, {
          confirmedReset: Boolean(importJob.requiresReset),
          selection: {
            sectionKinds: importSelection.sectionKinds,
            characterCandidateIds: selectedCharacterCandidateIds,
            // The review's default and the rows set by hand, resolved: every section whose subtitle is turned off.
            subtitleOverrides: importJob.preview ? subtitleOverridesToCommit(importJob.preview, importSelection) : undefined,
          },
        }),
      );
    } catch (error) {
      const message = apiErrorMessage(error);
      setImportJob((current) => (current ? { ...current, phase: 'error', error: message, message } : current));
    }
  };
  // Replacing clears what the narrator has built on the manuscript, so the button says so before the file dialog opens.
  const button = (
    <Button
      variant={found ? 'secondary' : 'primary'}
      pending={choosing.isPending('choose')}
      onClick={() =>
        void choosing.run('choose', async () => {
          try {
            const result = await api.selectManuscript();
            if (result.selected && result.jobId) {
              setImportSelection({});
              void beginImportPreview(result.jobId);
            } else notify('No manuscript selected');
          } catch (error) {
            notify(describeApiError(error), 'error');
          }
        })
      }
    >
      {found ? 'Replace manuscript' : 'Import manuscript'}
    </Button>
  );
  const chooseButton = found ? (
    <TooltipTarget text="Replace manuscript — confirmation clears Story Bible, notes, bookmarks, chapter statuses, and saved proofing results.">
      {button}
    </TooltipTarget>
  ) : (
    button
  );
  const dialogs = (
    <>
      {offerCandidate && (
        <ConfirmDialog
          title="Import manuscript?"
          body={`Found ${candidate.name} in this project folder. Import it now? You can also choose a different file with the import button.`}
          confirmLabel="Import"
          confirm={() =>
            void api
              .manuscriptBeginImport(candidate.path)
              .then((result) => (result.selected && result.jobId ? beginImportPreview(result.jobId) : undefined))
              .catch((error) => notify(describeApiError(error), 'error'))
          }
          cancel={() => {
            declinedCandidates.add(candidate.path);
            setDeclineCount((count) => count + 1);
          }}
        />
      )}
      {importJob?.phase === 'ready' && importJob.preview && (
        <ConfirmDialog
          title={`Import ${importJob.preview.sourceName}`}
          body={<ImportSummary preview={importJob.preview} selection={importSelection} requiresReset={Boolean(importJob.requiresReset)} />}
          confirmLabel={importJob.requiresReset ? 'Replace and reset' : 'Import'}
          confirmVariant={importJob.requiresReset ? 'danger' : 'primary'}
          confirm={() => void commitImport()}
          cancel={() =>
            void api
              .manuscriptImportCancel(importJob.id!)
              .then(() => setImportJob(undefined))
              .catch((error) => notify(error.message, 'error'))
          }
        >
          <ImportReview
            preview={importJob.preview}
            selection={importSelection}
            onSelectionChange={setImportSelection}
            headingLevel={headingLevel}
            onHeadingLevelChange={changeHeadingLevel}
            groupOpen={groupOpen}
            onGroupOpenChange={(group: ReviewGroupKey, open: boolean) => setGroupOpen((current) => ({ ...current, [group]: open }))}
            buildStoryBible={{ checked: buildAfterImport, onChange: setBuildAfterImport }}
            deliveryProfile={asksProfile ? { value: profileChoice, onChange: setProfileChoice } : undefined}
          />
        </ConfirmDialog>
      )}
      {importJob && importJob.phase !== 'ready' && (
        <WorkDialog
          title="Import manuscript"
          job={importJob}
          cancel={
            importJob.phase === 'preparing'
              ? () =>
                  void api
                    .manuscriptImportCancel(importJob.id!)
                    .then(() => setImportJob(undefined))
                    .catch((error) => notify(describeApiError(error), 'error'))
              : undefined
          }
          close={() => setImportJob(undefined)}
        />
      )}
      {buildAfterImportJob && (
        // Like the rebuild on the Story Bible page, the build can go on in the background (ADR 0076): the host keeps running it and the
        // app's job:ended subscriber says when it ends.
        <WorkDialog
          title="Build the Story Bible"
          job={buildAfterImportJob}
          close={() => setBuildAfterImportJob(undefined)}
          background={() => setBuildAfterImportJob(undefined)}
        />
      )}
      {/* The manuscript offer comes first and the credits prompt follows the import: held
          back while that offer or an import is on screen, so the two dialogs never stack. */}
      {!offerCandidate && !importJob && creditsSetup && (creditsSetup.needed || fillingInCredits) && (
        <CreditsSetupDialog
          state={creditsSetup}
          notify={notify}
          onDone={(next) => {
            setCreditsSetup(next);
            setFillingInCredits(false);
          }}
          onMoreFields={() => go('/settings#credits')}
        />
      )}
    </>
  );
  const creditsBanner = (
    <>
      {/* The way back: shown whenever the host says tokens are still unresolved and the narrator has not
          said "Don't ask" - never while the dialog above is already open, auto or by hand. */}
      {!offerCandidate && !importJob && creditsSetup?.banner && !creditsSetup.needed && !fillingInCredits && (
        <CreditsSetupBanner state={creditsSetup} notify={notify} onDone={setCreditsSetup} onFillIn={() => setFillingInCredits(true)} />
      )}
    </>
  );
  return { chooseButton, dialogs, creditsBanner };
}
