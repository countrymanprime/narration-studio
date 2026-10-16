import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import type { DeliveryProfile, PackageItem } from '../../../types';
import { deliveryProfileKey } from '../../master/deliveryProfile';
import { useHostRead } from './useHostRead';

/**
 * The page's package build over the render, encode and master port: the files already mastered and encoded (the export job) are what gets
 * packaged, the host opens its own folder picker when the build starts, and its progress, failure and the files it wrote are read from
 * the package job. Both jobs are read through `useHostRead`, so a host that goes quiet is shown as "can't tell, last heard N s ago" with
 * Check again, a late answer never replaces a newer one, and a job that ends elsewhere is read again on `job:ended`. Starting is guarded
 * against a second press while the first is still asking the host (the picker opens once), and once built the host shows that folder
 * in the file manager; it takes no path, so it opens only the folder it built into.
 */
export function useDeliveryBuild(profile: DeliveryProfile | undefined) {
  const port = usePort('renderEncodeMaster');
  const system = usePort('system');
  const exported = useHostRead(
    () => port.exportState(),
    (job) => job.phase === 'running',
  );
  const packaged = useHostRead(
    () => port.packageState(),
    (job) => job.phase === 'running',
  );
  const { again: readExport } = exported;
  const { again: readPackage } = packaged;
  useEffect(
    () =>
      system.subscribeJobEnded(() => {
        readExport();
        readPackage();
      }),
    [system, readExport, readPackage],
  );

  const [starting, setStarting] = useState(false);
  const pressed = useRef(false);
  const [problem, setProblem] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [opening, setOpening] = useState(false);
  const [openProblem, setOpenProblem] = useState<string>();

  const exportFiles = exported.value?.files;
  const encodedFiles = useMemo(() => exportFiles?.filter((file) => file.status === 'done' && file.encodedPath) ?? [], [exportFiles]);
  const job = packaged.value;
  const running = job?.phase === 'running';
  const finished = job && !running && job.phase !== 'idle' ? job : undefined;
  const exportRunning = exported.value?.phase === 'running';

  const build = useCallback(async () => {
    if (!profile || pressed.current) return;
    pressed.current = true;
    setStarting(true);
    setProblem(undefined);
    setNotice(undefined);
    const before = packaged.value?.id ?? null;
    const items: PackageItem[] = encodedFiles.map((file) => ({ kind: file.kind, title: file.title, path: file.encodedPath as string }));
    try {
      const next = await port.packageStart({ profileId: profile.id, profileVersion: profile.version, items });
      packaged.set(next);
      // The host answers the job it already had when the folder picker was closed without a folder: nothing was started.
      if (next.phase !== 'running' && (next.id ?? null) === before) setNotice('No folder was chosen, so no package was built.');
    } catch (failure) {
      setProblem(apiErrorMessage(failure));
    } finally {
      pressed.current = false;
      setStarting(false);
    }
  }, [profile, port, packaged, encodedFiles]);

  const cancel = useCallback(() => {
    port.packageCancel().then(packaged.set, (failure) => setProblem(apiErrorMessage(failure)));
  }, [port, packaged]);

  const openFolder = () => {
    setOpening(true);
    setOpenProblem(undefined);
    port
      .deliveryOpenPackageFolder()
      .catch((failure) => setOpenProblem(`The folder could not be opened: ${apiErrorMessage(failure)}`))
      .finally(() => setOpening(false));
  };

  return {
    /** The host is being asked, or the narrator is choosing a folder. */
    starting,
    running,
    /** What went wrong starting, cancelling or reading, in the host's words. */
    problem,
    /** Said once after a press that started nothing. */
    notice,
    /** Files mastered and encoded, so ready to package. */
    encoded: encodedFiles.length,
    /** Another job (the export) is using the files. */
    busy: exportRunning || running || starting,
    exportRunning,
    /** The package this profile last built, with the folder the host chose. */
    built: finished?.phase === 'success' && profile && finished.profile === deliveryProfileKey(profile) ? finished : undefined,
    failed: finished?.phase === 'error' ? finished : undefined,
    cancelled: finished?.phase === 'cancelled' ? finished : undefined,
    // The folder this profile's last build used; a build for another profile has its own, not this one's.
    folder: job && profile && job.profile === deliveryProfileKey(profile) ? job.outputDir || undefined : undefined,
    build,
    cancel,
    /** The host did not answer the latest read of the jobs: what it said, and when it last did. */
    quiet: packaged.error ?? exported.error,
    lastHeard: packaged.error !== undefined ? packaged.lastHeard : exported.lastHeard,
    checkAgain: () => {
      readExport();
      readPackage();
    },
    opening,
    /** Why the built package's folder could not be shown, in the host's words. */
    openProblem,
    openFolder,
  };
}

export type DeliveryBuild = ReturnType<typeof useDeliveryBuild>;
