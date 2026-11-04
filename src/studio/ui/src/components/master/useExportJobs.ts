import { useEffect, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { apiErrorMessage } from '../../api/errorMessage';
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
  const [problem, setProblem] = useState<string>();
  const [packageJob, setPackageJob] = useState<PackageJob>();
  const [packageProblem, setPackageProblem] = useState<string>();
  const [multiPackageJob, setMultiPackageJob] = useState<MultiPackageJob>();
  const [multiPackageProblem, setMultiPackageProblem] = useState<string>();
  const starting = useExportStarting();

  useEffect(() => {
    let active = true;
    api
      .exportState()
      .then((state) => active && setExportJob(state))
      .catch((error) => active && setProblem(apiErrorMessage(error)));
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
      api
        .exportState()
        .then((state) => active && setExportJob(state))
        .catch((error) => active && setProblem(apiErrorMessage(error)));
    }, POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, exportRunning, exportJob]);

  const packageRunning = packageJob?.phase === 'running';
  useEffect(() => {
    if (!packageRunning) return;
    let active = true;
    const timer = setTimeout(() => {
      api
        .packageState()
        .then((state) => active && setPackageJob(state))
        .catch((error) => active && setPackageProblem(apiErrorMessage(error)));
    }, POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, packageRunning, packageJob]);

  const multiPackageRunning = multiPackageJob?.phase === 'running';
  useEffect(() => {
    if (!multiPackageRunning) return;
    let active = true;
    const timer = setTimeout(() => {
      api
        .packageMultiState()
        .then((state) => active && setMultiPackageJob(state))
        .catch((error) => active && setMultiPackageProblem(apiErrorMessage(error)));
    }, POLL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, multiPackageRunning, multiPackageJob]);

  const pick = async () => {
    setPicking(true);
    setProblem(undefined);
    try {
      // An answer with no paths at all is a cancel, as an empty list is (qa on #2988).
      const paths = (await api.exportPickFiles())?.paths ?? [];
      if (paths.length === 0) return;
      setItems((current) => {
        const existing = new Set(current.map((item) => item.path));
        const added = paths
          .filter((path) => !existing.has(path))
          .map((path): ExportItem => ({ kind: kindFromFileName(fileName(path)), title: titleFromPath(path), path }));
        return [...current, ...added];
      });
    } catch (error) {
      setProblem(apiErrorMessage(error));
    } finally {
      setPicking(false);
    }
  };

  const updateItem = (path: string, patch: Partial<ExportItem>) =>
    setItems((current) => current.map((item) => (item.path === path ? { ...item, ...patch } : item)));
  const removeItem = (path: string) => setItems((current) => current.filter((item) => item.path !== path));

  const rereadExport = () => void api.exportState().then(setExportJob, (error) => setProblem(apiErrorMessage(error)));

  /**
   * Starts Master & encode with `approval`, the narrator's yes from the approval dialog (null without one). One start at a time
   * (`startExportRequest`): a second press while one waits sends nothing and answers 'busy'. A refusal is a toast in the host's
   * words; no answer within the bound is a toast too, and the job is read again, as it is when that late answer comes.
   */
  const startExport = (approval: MasteringApproval | null = null): Promise<ExportStartOutcome> =>
    new Promise((resolve) => {
      setProblem(undefined);
      const sent = startExportRequest(() => api.exportStart({ items, master, format: 'mp3', approval }), {
        answered: (job) => {
          setExportJob(job);
          resolve('started');
        },
        refused: (error) => {
          setProblem(apiErrorMessage(error));
          resolve('refused');
        },
        timedOut: () => {
          setProblem(EXPORT_START_NO_ANSWER);
          rereadExport();
          resolve('no-answer');
        },
        late: rereadExport,
      });

      if (!sent) resolve('busy');
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
  const cancelExport = () => void api.exportCancel().then(setExportJob, (error) => setProblem(apiErrorMessage(error)));

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
    problem,
    pick,
    updateItem,
    removeItem,
    startExport,
    planExport,
    cancelExport,
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
