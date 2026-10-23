import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { usePort } from '../../../ports/usePort';
import { without } from '../data/record';
import { isInstallRunning, type AssetCatalog, type AssetInstallJob, type AssetItem } from '../../../types';

/** How often a running download is asked how far it is. */
const POLL_MS = 400;

export type AssetStatus = 'installed' | 'missing' | 'downloading' | 'verifying' | 'failed' | 'repair' | 'unavailable';

export type AssetView = {
  item: AssetItem;
  status: AssetStatus;
  /** 0 to 100, real bytes over real bytes; only meaningful while downloading. */
  percent: number;
  /** Why the last download or action failed, in the host's words. */
  failure: string;
};

export const assetKey = (item: Pick<AssetItem, 'kind' | 'id'> | { kind: string; id: string }): string => `${item.kind}/${item.id}`;

export type AssetsStore = {
  catalog: AssetCatalog | undefined;
  /** The host's sentence when the list could not be read. */
  loadError: string;
  views: AssetView[];
  viewOf: (ref: { kind: string; id: string }) => AssetView | undefined;
  refresh: () => Promise<void>;
  install: (item: AssetItem) => Promise<void>;
  cancel: (item: AssetItem) => Promise<void>;
  /** Removes the asset. Resolves with the host's sentence when it refused, or undefined when it is gone. */
  remove: (item: AssetItem) => Promise<string | undefined>;
  dismissFailure: (item: AssetItem) => void;
  /** What a screen reader hears about downloads. */
  announcement: string;
};

const Context = createContext<AssetsStore | undefined>(undefined);

/** Reads the host's asset list once for the page and runs the downloads started from it. Leaving the page stops the polling, not the downloads. */
export function AssetsStoreProvider({ children }: { children: ReactNode }) {
  const api = usePort('assets');
  const [catalog, setCatalog] = useState<AssetCatalog>();
  const [loadError, setLoadError] = useState('');
  const [jobs, setJobs] = useState<Record<string, AssetInstallJob>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState<Record<string, boolean>>({});
  const [announcement, setAnnouncement] = useState('');
  const alive = useRef(true);
  const following = useRef(new Set<string>());
  const latest = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const next = await api.assetsList();
      if (!alive.current || mine !== latest.current) return;
      setCatalog(next);
      setLoadError('');
    } catch (error) {
      if (alive.current && mine === latest.current) setLoadError(apiErrorMessage(error));
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const follow = useCallback(
    async (item: Pick<AssetItem, 'kind' | 'id' | 'displayName'>, first: AssetInstallJob) => {
      const key = assetKey(item);
      if (following.current.has(key)) return;
      following.current.add(key);
      try {
        let job = first;
        setJobs((current) => ({ ...current, [key]: job }));
        while (isInstallRunning(job)) {
          await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
          if (!alive.current) return;
          job = await api.assetsInstallState(job.id);
          if (!alive.current) return;
          setJobs((current) => ({ ...current, [key]: job }));
        }
        if (job.phase === 'error') {
          const reason = job.error || job.message;
          setFailures((current) => ({ ...current, [key]: reason }));
          setAnnouncement(`${item.displayName} could not be downloaded. ${reason}`);
        } else if (job.phase === 'success') {
          setAnnouncement(`${item.displayName} downloaded and checked.`);
        }
        setJobs((current) => without(current, key));
        await refresh();
      } catch (error) {
        if (!alive.current) return;
        const reason = apiErrorMessage(error);
        setFailures((current) => ({ ...current, [key]: reason }));
        setJobs((current) => without(current, key));
        setAnnouncement(`${item.displayName} could not be downloaded. ${reason}`);
      } finally {
        following.current.delete(key);
      }
    },
    [api, refresh],
  );

  // A download already running when the page opened is followed, so its bar is on screen.
  useEffect(() => {
    for (const item of catalog?.assets ?? []) {
      if (item.activeJobId && !following.current.has(assetKey(item))) {
        void api.assetsInstallState(item.activeJobId).then(
          (job) => (alive.current ? follow(item, job) : undefined),
          () => undefined,
        );
      }
    }
  }, [catalog, api, follow]);

  const install = useCallback(
    async (item: AssetItem) => {
      const key = assetKey(item);
      if (following.current.has(key) || starting[key]) return;
      setFailures((current) => without(current, key));
      setStarting((current) => ({ ...current, [key]: true }));
      try {
        const job = await api.assetsInstall(item.kind, item.id);
        await follow(item, job);
      } catch (error) {
        const reason = apiErrorMessage(error);
        setFailures((current) => ({ ...current, [key]: reason }));
        setAnnouncement(`${item.displayName} could not be downloaded. ${reason}`);
      } finally {
        if (alive.current) setStarting((current) => without(current, key));
      }
    },
    [api, follow, starting],
  );

  const cancel = useCallback(
    async (item: AssetItem) => {
      const job = jobs[assetKey(item)];
      if (!job) return;
      try {
        const answer = await api.assetsInstallCancel(job.id);
        setJobs((current) => ({ ...current, [assetKey(item)]: answer }));
        setAnnouncement(`Download of ${item.displayName} cancelled.`);
      } catch (error) {
        setFailures((current) => ({ ...current, [assetKey(item)]: apiErrorMessage(error) }));
      }
    },
    [api, jobs],
  );

  const remove = useCallback(
    async (item: AssetItem) => {
      try {
        await api.assetsRemove(item.kind, item.id);
        setAnnouncement(`${item.displayName} removed.`);
        await refresh();
        return undefined;
      } catch (error) {
        return apiErrorMessage(error);
      }
    },
    [api, refresh],
  );

  const dismissFailure = useCallback((item: AssetItem) => setFailures((current) => without(current, assetKey(item))), []);

  const views = useMemo<AssetView[]>(
    () =>
      (catalog?.assets ?? []).map((item) => {
        const key = assetKey(item);
        const job = jobs[key];
        const failure = failures[key] ?? '';
        let status: AssetStatus;
        if (job && isInstallRunning(job)) status = job.phase === 'verifying' ? 'verifying' : 'downloading';
        else if (starting[key]) status = 'downloading';
        else if (failure) status = 'failed';
        else if (item.installState === 'installed') status = 'installed';
        else if (item.installState === 'verification_failed') status = 'repair';
        else if (item.unavailableReason) status = 'unavailable';
        else status = 'missing';
        return { item, status, percent: job?.percent ?? 0, failure };
      }),
    [catalog, jobs, failures, starting],
  );
  const viewOf = useCallback((ref: { kind: string; id: string }) => views.find((view) => view.item.kind === ref.kind && view.item.id === ref.id), [views]);

  const value = useMemo<AssetsStore>(
    () => ({ catalog, loadError, views, viewOf, refresh, install, cancel, remove, dismissFailure, announcement }),
    [catalog, loadError, views, viewOf, refresh, install, cancel, remove, dismissFailure, announcement],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAssetsStore(): AssetsStore {
  const value = useContext(Context);
  if (!value) throw new Error('useAssetsStore needs an AssetsStoreProvider');
  return value;
}
