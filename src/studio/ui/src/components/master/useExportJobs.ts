import { useEffect, useRef, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { apiErrorMessage } from '../../api/errorMessage';
import { overlay } from '../../overlay/overlayService';
import type { DeliveryProfile, ExportItem, ExportJob, ExportPlan, MasteringApproval, MultiPackageJob, PackageItem, PackageJob } from '../../types';
import { startExportRequest, useExportStarting } from './masterRequests';
import { kindFromFileName } from './packageKind';

/** How a request to start the export ended for the panel that sent it. */
export type ExportStartOutcome = 'started' | 'refused' | 'no-answer' | 'busy';

/** The toast for a start the host did not answer in time. */
export const EXPORT_START_NO_ANSWER = 'The app did not answer when asked to start the export. What it is doing was read again.';

/** The toast for a plan the host did not answer in time. */
export const EXPORT_PLAN_NO_ANSWER = 'The app did not answer when asked what the export would do. Nothing was started.';

/** How often a running export or package job is read. */
const POLL_MS = 500;

/** The file name, with its extension, for display and labels. */
export const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** The file name without its extension, seeded as a chapter's default title. */
const titleFromPath = (path: string): string => fileName(path).replace(/\.[^.]+$/, '');

/**
 * Master & QC's export and package jobs: the narrator picks rendered files, gives each a role
 * and (for a chapter) a title, masters them to spec (internal/masteringport's chain, on by default: the mock's "Master all to
 * spec"), encodes them (internal/encodeport) and assembles one delivery profile's package (internal/packager). One hook, so the
 * files panel and the package panel beside it read the same jobs. The host keeps both jobs, so leaving the page and coming back
 * shows them again, and one still running is followed. Nothing here changes a source file: every stage writes a new one.
 */
export function useExportJobs() {
  const api = useApi();
  const [picking, setPicking] = useState(false);
  const [items, setItems] = useState<ExportItem[]>([]);
  const [master, setMaster] = useState(true);
  const [exportJob, setExportJob] = useState<ExportJob>();
  // A pick, start or cancel the host refused, and a read of the job that failed: the read's goes once a read answers again.
  const [problem, setProblem] = useState<string>();
  const [readProblem, setReadProblem] = useState<string>();
  const [packageJob, setPackageJob] = useState<PackageJob>();
  const [packageProblem, setPackageProblem] = useState<string>();
  const [multiPackageJob, setMultiPackageJob] = useState<MultiPackageJob>();
  const [multiPackageProblem, setMultiPackageProblem] = useState<string>();
  // Each poll below re-arms on its job's next answer; a failed read changes no job, so it bumps its counter instead, or one failed
  // read would stop the poll for good with the job still drawn as running (#2935 review).
  const [exportRetry, setExportRetry] = useState(0);
  const [packageRetry, setPackageRetry] = useState(0);
  const [multiPackageRetry, setMultiPackageRetry] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const cancelSent = useRef(false);
  // Picked files whose row no longer shows the last job's result: removed since that job, or about to be exported again.
  const [cleared, setCleared] = useState<ReadonlySet<string>>(() => new Set());
  // Whether the job the page opened on, once it has ended, still gives its files to an empty list: once, so removing them dismisses it.
  const adoptOpeningJob = useRef(true);
  const starting = useExportStarting();

  useEffect(() => {
    let active = true;
    api
      .exportState()
      .then((state) => active && setExportJob(state))
      .catch((error) => active && setReadProblem(apiErrorMessage(error)));
    api
      .packageState()
      .then((state) => active && setPackageJob(state))
      .catch((error) => active && setPackageProblem(apiErrorMessage(error)));
    api
      .packageMultiState()
      .then((state) => active && setMultiPackageJob(state))
      .catch((error) => active && setMultiPackageProblem(apiErrorMessage(error)));
    return () => {
      active = false;
    };
  }, [api]);

  const exportRunning = exportJob?.phase === 'running';
  useEffect(() => {
    if (!exportRunning) return;
    let active = true;
    const timer = setTimeout(() => {
      api.exportState().then(
        (state) => {
          if (!active) return;
          setReadProblem(undefined);
          setExportJob(state);
        },
        (error) => {
          if (!active) return;
          setReadProblem(apiErrorMessage(error));
          setExportRetry((count) => count + 1);
        },
      );
    }, POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, exportRunning, exportJob, exportRetry]);

  // The job the page opened on, once it is not running: its files become the picked files when none are picked, so the last run's rows
  // can be changed, removed or run again like any others (#2935 review). Only once: removing them all dismisses the last run.
  useEffect(() => {
    if (!adoptOpeningJob.current || !exportJob || exportJob.phase === 'running') return;
    adoptOpeningJob.current = false;
    if (exportJob.files.length === 0) return;
    setItems((current) => (current.length > 0 ? current : exportJob.files.map(({ kind, title, path }) => ({ kind, title, path }))));
  }, [exportJob]);

  const packageRunning = packageJob?.phase === 'running';
  useEffect(() => {
    if (!packageRunning) return;
    let active = true;
    const timer = setTimeout(() => {
      api
        .packageState()
        .then((state) => active && setPackageJob(state))
        .catch((error) => {
          if (!active) return;
          setPackageProblem(apiErrorMessage(error));
          setPackageRetry((count) => count + 1);
        });
    }, POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, packageRunning, packageJob, packageRetry]);

  const multiPackageRunning = multiPackageJob?.phase === 'running';
  useEffect(() => {
    if (!multiPackageRunning) return;
    let active = true;
    const timer = setTimeout(() => {
      api
        .packageMultiState()
        .then((state) => active && setMultiPackageJob(state))
        .catch((error) => {
          if (!active) return;
          setMultiPackageProblem(apiErrorMessage(error));
          setMultiPackageRetry((count) => count + 1);
        });
    }, POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, multiPackageRunning, multiPackageJob, multiPackageRetry]);

  const pick = async () => {
    setPicking(true);
    setProblem(undefined);
    try {
      // An answer with no paths at all is a cancel, as an empty list is (qa on #2988).
      const paths = (await api.exportPickFiles())?.paths ?? [];
      if (paths.length === 0) return;
      // A path picked twice in one batch is one row; one already listed adds none, and the narrator is told so, once per pick.
      const batch = [...new Set(paths)];
      const listed = new Set(items.map((item) => item.path));
      const repeats = batch.filter((path) => listed.has(path));
      setItems((current) => {
        const existing = new Set(current.map((item) => item.path));
        const added = batch
          .filter((path) => !existing.has(path))
          .map((path): ExportItem => ({ kind: kindFromFileName(fileName(path)), title: titleFromPath(path), path }));
        return [...current, ...added];
      });
      if (repeats.length === 1) overlay.toast(`${fileName(repeats[0] ?? '')} is already in the list.`);
      else if (repeats.length > 1) overlay.toast(`${repeats.length} files are already in the list.`);
    } catch (error) {
      setProblem(apiErrorMessage(error));
    } finally {
      setPicking(false);
    }
  };

  const updateItem = (path: string, patch: Partial<ExportItem>) =>
    setItems((current) => current.map((item) => (item.path === path ? { ...item, ...patch } : item)));
  // A removed row's result goes with it: picked again, it is a new file to this list, not the last run's.
  const removeItem = (path: string) => {
    setItems((current) => current.filter((item) => item.path !== path));
    setCleared((current) => new Set(current).add(path));
  };
  /** The last job's result for a picked file, or none when the row was removed since or is being exported again. */
  const resultFor = (path: string) => (cleared.has(path) ? undefined : exportJob?.files.find((file) => file.path === path));

  const rereadExport = () => void api.exportState().then(setExportJob, (error) => setProblem(apiErrorMessage(error)));

  /**
   * Starts Master & encode with `approval`, the narrator's yes from the approval dialog (null without one). One start at a time
   * (`startExportRequest`): a second press while one waits sends nothing and answers 'busy'. A refusal is a toast in the host's
   * words; no answer within the bound is a toast too, and the job is read again, as it is when that late answer comes.
   */
  const startExport = (approval: MasteringApproval | null = null): Promise<ExportStartOutcome> =>
    new Promise((resolve) => {
      setProblem(undefined);
      // While the start waits, no row shows the last run's result; a start that does not happen gives them back.
      const before = cleared;
      const sent = startExportRequest(() => api.exportStart({ items, master, format: 'mp3', approval }), {
        answered: (job) => {
          adoptOpeningJob.current = false;
          setCleared(new Set());
          setExportJob(job);
          resolve('started');
        },
        refused: (error) => {
          setCleared(before);
          setProblem(apiErrorMessage(error));
          resolve('refused');
        },
        timedOut: () => {
          setCleared(before);
          setProblem(EXPORT_START_NO_ANSWER);
          rereadExport();
          resolve('no-answer');
        },
        late: rereadExport,
      });

      if (!sent) resolve('busy');
      else setCleared(new Set([...before, ...items.map((item) => item.path)]));
    });

  /**
   * Asks the host what Master & encode would do (ExportPlan), starting nothing: the row it masters with, whether it needs the
   * narrator's approval or a macro, and the items as the host will export them. Held with the start (`startExportRequest`), so a
   * press while either waits sends nothing. A refusal is a toast in the host's words, as a start's is; so is no answer in time.
   */
  const planExport = (): Promise<{ outcome: ExportStartOutcome; plan?: ExportPlan }> =>
    new Promise((resolve) => {
      setProblem(undefined);
      const sent = startExportRequest(() => api.exportPlan({ items, master, format: 'mp3', approval: null }), {
        answered: (plan) => resolve({ outcome: 'started', plan }),
        refused: (error) => {
          setProblem(apiErrorMessage(error));
          resolve({ outcome: 'refused' });
        },
        timedOut: () => {
          setProblem(EXPORT_PLAN_NO_ANSWER);
          resolve({ outcome: 'no-answer' });
        },
        late: () => undefined,
      });
      if (!sent) resolve({ outcome: 'busy' });
    });
  // One cancel at a time: Cancel is busy while its request is out, and a second press sends nothing (#2935 review).
  const cancelExport = () => {
    if (cancelSent.current) return;
    cancelSent.current = true;
    setCancelling(true);
    void api
      .exportCancel()
      .then(setExportJob, (error) => setProblem(apiErrorMessage(error)))
      .finally(() => {
        cancelSent.current = false;
        setCancelling(false);
      });
  };

  const doneFiles = exportJob?.files.filter((file) => file.status === 'done' && file.encodedPath) ?? [];

  const startPackage = async (profile: DeliveryProfile) => {
    setPackageProblem(undefined);
    const packageItems: PackageItem[] = doneFiles.map((file) => ({ kind: file.kind, title: file.title, path: file.encodedPath as string }));
    try {
      setPackageJob(await api.packageStart({ profileId: profile.id, profileVersion: profile.version, items: packageItems }));
    } catch (error) {
      setPackageProblem(apiErrorMessage(error));
    }
  };
  const cancelPackage = () => void api.packageCancel().then(setPackageJob, (error) => setPackageProblem(apiErrorMessage(error)));

  const startMultiPackage = async (profiles: DeliveryProfile[]) => {
    setMultiPackageProblem(undefined);
    const packageItems: PackageItem[] = doneFiles.map((file) => ({ kind: file.kind, title: file.title, path: file.encodedPath as string }));
    try {
      setMultiPackageJob(
        await api.packageStartMulti({
          selections: profiles.map((profile) => ({ profileId: profile.id, profileVersion: profile.version })),
          items: packageItems,
        }),
      );
    } catch (error) {
      setMultiPackageProblem(apiErrorMessage(error));
    }
  };
  const cancelMultiPackage = () => void api.packageMultiCancel().then(setMultiPackageJob, (error) => setMultiPackageProblem(apiErrorMessage(error)));

  return {
    picking,
    items,
    master,
    setMaster,
    exportJob,
    exportRunning,
    starting,
    problem: problem ?? readProblem,
    pick,
    updateItem,
    removeItem,
    resultFor,
    startExport,
    planExport,
    cancelExport,
    cancelling,
    doneFiles,
    packageJob,
    packageRunning,
    packageProblem,
    startPackage,
    cancelPackage,
    multiPackageJob,
    multiPackageRunning,
    multiPackageProblem,
    startMultiPackage,
    cancelMultiPackage,
  };
}

export type ExportJobs = ReturnType<typeof useExportJobs>;
