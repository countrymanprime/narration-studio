import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetsApi } from '../../../api/contracts/assets';
import { apiErrorMessage } from '../../../api/errorMessage';
import { useAssetInstall } from '../../../hooks/useAssetInstall';
import { usePort } from '../../../ports/usePort';
import type { AssetItem } from '../../../types';
import { analysisTools, ANALYSIS_KIND, statusOf, type ToolRun, type ToolStatus } from './components';

/** What the analysis tools section needs of the asset registry: its list, an install with its progress and cancel, and a removal. */
export type ComponentsPort = Pick<AssetsApi, 'assetsList' | 'assetsInstall' | 'assetsInstallState' | 'assetsInstallCancel' | 'assetsRemove'>;

/** The analysis tools over the registry: the `ComponentsPort` the section reads (ADR 0770). */
export const useComponentsPort = (): ComponentsPort => usePort('assets');

/**
 * The analysis tools and what is being done to them. Downloads run one after another through the one `useAssetInstall` loop: `install`
 * queues tools, the head of the queue is the one downloading, and the next starts when it ends. A download that was running when the
 * section opened is followed through the registry's `activeJobId`. A failure is kept per tool, with the host's sentence, until Try again or
 * Dismiss; a cancel returns the tool to not installed.
 */
export function useAnalysisTools(port: ComponentsPort) {
  const [tools, setTools] = useState<AssetItem[]>();
  const [loadError, setLoadError] = useState('');
  const [queue, setQueue] = useState<string[]>([]);
  const [failures, setFailures] = useState<Record<string, string>>({});
  // The job of a download that was already running when the list was read: the next start follows it instead of asking for a new one.
  const follow = useRef('');
  const head = queue[0];
  const headRef = useRef(head);
  headRef.current = head;

  const reload = useCallback(async () => {
    try {
      const list = analysisTools(await port.assetsList());
      setTools(list);
      setLoadError('');
      const active = list.find((item) => item.activeJobId);
      if (active) {
        setQueue((current) => {
          if (current.length > 0) return current;
          follow.current = active.activeJobId;
          return [active.id];
        });
      }
    } catch (error) {
      setLoadError(apiErrorMessage(error));
    }
  }, [port]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const fail = useCallback((id: string | undefined, message: string) => {
    if (id) setFailures((current) => ({ ...current, [id]: message }));
  }, []);

  const install = useAssetInstall({
    start: () => {
      const jobId = follow.current;
      follow.current = '';
      return jobId ? port.assetsInstallState(jobId) : port.assetsInstall(ANALYSIS_KIND, headRef.current ?? '');
    },
    state: (jobId) => port.assetsInstallState(jobId),
    cancel: (jobId) => port.assetsInstallCancel(jobId),
    // The tool leaves the queue once the list says it is installed, so its row never shows Download for the length of the reload.
    onSuccess: async () => {
      await reload();
      next.current();
    },
    onFailure: (message) => fail(headRef.current, message),
  });
  const { job, starting, running, begin, reset } = install;
  const next = useRef(() => {});
  next.current = () => {
    reset();
    setQueue((current) => current.slice(1));
  };

  // The head of the queue starts once nothing runs; a head whose download failed or was cancelled leaves the queue.
  useEffect(() => {
    if (!head || starting || running || job?.phase === 'success') return;
    if (job || install.failure) next.current();
    else void begin();
  }, [head, starting, running, job, install.failure, begin]);

  const runOf = useCallback(
    (id: string): ToolRun => ({
      job: id === head ? job : undefined,
      starting: id === head && (starting || (running && !job)),
      failure: failures[id],
    }),
    [failures, head, job, running, starting],
  );

  const enqueue = useCallback((ids: string[]) => {
    setFailures((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id))));
    setQueue((current) => [...current, ...ids.filter((id) => !current.includes(id))]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setFailures((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
  }, []);

  const cancel = useCallback(
    (id: string) => {
      if (id === head) void install.cancel();
      else setQueue((current) => current.filter((queued) => queued !== id));
    },
    [head, install],
  );

  const remove = useCallback(
    async (id: string) => {
      await port.assetsRemove(ANALYSIS_KIND, id);
      await reload();
    },
    [port, reload],
  );

  const statusFor = useCallback((item: AssetItem): ToolStatus => statusOf(item, runOf(item.id)), [runOf]);

  return {
    tools,
    loadError,
    reload,
    statusFor,
    /** The running job of a tool, for its progress, or undefined. */
    jobFor: (id: string) => (id === head && running ? job : undefined),
    failureFor: (id: string) => failures[id] ?? '',
    cancelFailure: install.cancelFailure,
    install: enqueue,
    cancel,
    dismiss,
    remove,
  };
}
