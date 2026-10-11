import type { DeliveryProfile } from '../../../types';
import { useExportJobs } from '../../master/useExportJobs';

/**
 * The page's package build over the same export and package jobs Master & QC runs (useExportJobs): the build assembles the files already
 * mastered and encoded there, the host asks for the folder, and its progress, failure and the files it wrote are read from the job.
 */
export function useBuildPackage(profile: DeliveryProfile | undefined) {
  const jobs = useExportJobs();
  const job = jobs.packageJob;
  const finished = job && !jobs.packageRunning && job.phase !== 'idle' ? job : undefined;
  return {
    running: jobs.packageRunning,
    problem: jobs.packageProblem,
    /** Files mastered and encoded and so ready to package. */
    encoded: jobs.doneFiles.length,
    busy: jobs.exportRunning || jobs.packageRunning,
    /** The package the host last built, with the folder it chose. */
    built: finished?.phase === 'success' ? finished : undefined,
    failed: finished?.phase === 'error' ? finished : undefined,
    folder: job?.outputDir || undefined,
    build: () => {
      if (profile) void jobs.startPackage(profile);
    },
    cancel: jobs.cancelPackage,
  };
}

export type BuildPackage = ReturnType<typeof useBuildPackage>;
