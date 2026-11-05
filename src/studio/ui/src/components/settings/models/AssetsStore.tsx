import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { without } from '../data/record';
import {
  isInstallRunning,
  isMoveRunning,
  type AssetCatalog,
  type AssetInstallJob,
  type AssetItem,
  type AssetMoveState,
  type AssetVerifyResult,
  type AssetsApi,
} from '../../../types';

/** Raised on the window when a move of the downloads ended, so the Changed marks (customChanged.ts) read the folder again. */
export const MODELS_FOLDER_CHANGED = 'narration:models-folder-changed';

/** The move each host last showed, so a move that ended while Settings was closed is shown once and not on every visit. */
const shownMoves = new WeakMap<object, string>();

/** How often a running download is asked how far it is. */
const POLL_MS = 400;

/**
 * How long Check the files waits for the host. A check reads every byte, seconds for a large model; a host that has not answered by then
 * is given up on, so the row does not stay busy for good.
 */
export const VERIFY_WAIT_MS = 120_000;

/**
 * The checks of one host, kept outside the page, so a row drawn again, or the Settings page opened again, still shows them. `running`: the
 * checks under way, each ending within VERIFY_WAIT_MS, so the row stays busy and ignores another press. `unchecked`: the assets whose last
 * check was refused or not answered, whose row must not claim its files were checked until a check passes or a download replaces them.
 */
type HostChecks = { running: Map<string, Promise<void>>; unchecked: Set<string> };
const hostChecks = new WeakMap<object, HostChecks>();
const checksOf = (api: object): HostChecks => {
  let checks = hostChecks.get(api);
  if (!checks) hostChecks.set(api, (checks = { running: new Map(), unchecked: new Set() }));
  return checks;
};

/** What the page's live region says when a check answers: the files whole, damaged or gone, and what to do next. */
const CHECK_RESULT: Record<AssetVerifyResult['installState'], (name: string) => string> = {
  installed: (name) => `${name}: files checked, all whole.`,
  verification_failed: (name) => `${name}: a file failed its check. Repair it.`,
  not_installed: (name) => `${name}: its files are gone. Download it again.`,
};

/** The sentence for a check that could not be made: the host's words after a colon, or a full stop when it gave none. */
const notChecked = (name: string, reason: string): string =>
  reason.trim() ? `The files of ${name} could not be checked: ${reason.trim()}` : `The files of ${name} could not be checked.`;

export type AssetStatus = 'installed' | 'missing' | 'downloading' | 'verifying' | 'failed' | 'repair' | 'unavailable';

export type AssetView = {
  item: AssetItem;
  status: AssetStatus;
  /** 0 to 100, real bytes over real bytes; only meaningful while downloading. */
  percent: number;
  /** Why the last download or action failed, in the host's words. */
  failure: string;
  /** Check the files is reading the installed asset. Its status stays `installed`: it is installed until the host says otherwise. */
  checking: boolean;
  /** The last Check the files was refused or not answered: the row does not say its files were checked. */
  unchecked: boolean;
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
  /**
   * Check the files: reads every byte of an installed asset (assetsVerify) and moves its row to the answer, then reads the list again for
   * `verifiedAt`. A press while one runs for the asset is ignored; a refusal, or no answer within VERIFY_WAIT_MS, is an error toast.
   */
  verify: (item: AssetItem) => Promise<void>;
  /** What a screen reader hears about downloads. */
  announcement: string;
  /** The move of the downloads to another folder that runs, or how the last one ended until it is dismissed; undefined when there is none to show. */
  move: AssetMoveState | undefined;
  /** Asks for a folder in the system dialog: the path, or empty when the narrator closed it. A refusal is an error toast. */
  pickFolder: () => Promise<string>;
  /**
   * Starts moving the downloads to `target` (empty is the default folder) and follows the move. Resolves with the host's sentence when it
   * refused to start, or undefined once it started; how it ends is `move`.
   */
  startMove: (target: string) => Promise<string | undefined>;
  cancelMove: () => Promise<void>;
  /** Clears the end of a move from `move` (the dialog's Close). */
  dismissMove: () => void;
  /** Deletes the old copy a move left. Resolves with the host's sentence when it refused, or undefined when it is gone. */
  deleteOld: () => Promise<string | undefined>;
  /** Ends the offer to delete the old copy and leaves it. */
  keepOld: () => Promise<string | undefined>;
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

  // The host's record of failed checks, drawn: a page opened after one still does not claim the files were checked.
  const [unchecked, setUnchecked] = useState<Record<string, true>>(() => Object.fromEntries([...checksOf(api).unchecked].map((key) => [key, true])));
  const setUnverified = useCallback(
    (key: string, failed: boolean) => {
      const record = checksOf(api).unchecked;
      if (failed) record.add(key);
      else record.delete(key);
      if (alive.current) setUnchecked((current) => (failed ? { ...current, [key]: true } : without(current, key)));
    },
    [api],
  );

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
          // The download checked every file it wrote, so a refused Check the files before it no longer stands.
          setUnverified(key, false);
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
    [api, refresh, setUnverified],
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
        setUnverified(assetKey(item), false);
        setAnnouncement(`${item.displayName} removed.`);
        await refresh();
        return undefined;
      } catch (error) {
        return apiErrorMessage(error);
      }
    },
    [api, refresh, setUnverified],
  );

  const dismissFailure = useCallback((item: AssetItem) => setFailures((current) => without(current, assetKey(item))), []);

  // A check started before this page opened (the narrator left and came back) is drawn busy until it ends, then the list is read again.
  const [checking, setChecking] = useState<Record<string, true>>(() => Object.fromEntries([...checksOf(api).running.keys()].map((key) => [key, true])));
  useEffect(() => {
    for (const [key, task] of checksOf(api).running) {
      void task.finally(() => {
        if (!alive.current) return;
        setChecking((current) => without(current, key));
        setUnchecked(() => Object.fromEntries([...checksOf(api).unchecked].map((done) => [done, true])));
        void refresh();
      });
    }
  }, [api, refresh]);

  const verify = useCallback(
    async (item: AssetItem) => {
      const key = assetKey(item);
      const { running } = checksOf(api);
      if (running.has(key)) return;
      const task = check(api, item).then((answer) => {
        // Recorded for the host whether or not this page is still open; what is drawn and said is this page's.
        setUnverified(key, !answer);
        if (!answer || !alive.current) return;
        setAnnouncement(CHECK_RESULT[answer.installState](item.displayName));
        // The row follows the answer at once; the read after it brings the host's `verifiedAt` (and the same state).
        setCatalog(
          (current) =>
            current && {
              ...current,
              assets: current.assets.map((asset) => (assetKey(asset) === key ? { ...asset, installState: answer.installState } : asset)),
            },
        );
      });
      running.set(key, task);
      setChecking((current) => ({ ...current, [key]: true }));
      try {
        await task;
      } finally {
        running.delete(key);
        if (alive.current) {
          setChecking((current) => without(current, key));
          await refresh();
        }
      }
    },
    [api, refresh, setUnverified],
  );

  const [move, setMove] = useState<AssetMoveState>();
  const followingMove = useRef(false);
  const followMove = useCallback(
    async (first: AssetMoveState) => {
      if (followingMove.current) return;
      followingMove.current = true;
      shownMoves.set(api, first.id);
      try {
        let state = first;
        setMove(state);
        while (isMoveRunning(state)) {
          await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
          if (!alive.current) return;
          state = await api.assetsMoveState();
          if (!alive.current) return;
          setMove(state);
        }
        // The list names the folder in use, whether the old copy is waiting, and what is installed: read again whatever the end was.
        setAnnouncement(state.phase === 'success' ? 'The models were moved and are in use.' : state.error || state.message);
        await refresh();
        window.dispatchEvent(new Event(MODELS_FOLDER_CHANGED));
      } catch (error) {
        if (!alive.current) return;
        const reason = apiErrorMessage(error);
        setMove((current) => current && { ...current, phase: 'error', error: reason, message: reason });
        setAnnouncement(reason);
      } finally {
        followingMove.current = false;
      }
    },
    [api, refresh],
  );

  // A move already running when the page opened is followed, so its dialog is on screen.
  useEffect(() => {
    void api.assetsMoveState().then(
      (state) => {
        if (!alive.current) return undefined;
        if (isMoveRunning(state)) return followMove(state);
        // A move that failed or was cancelled while Settings was closed is told once, so the narrator learns the models did not move.
        if ((state.phase === 'error' || state.phase === 'cancelled') && shownMoves.get(api) !== state.id) {
          shownMoves.set(api, state.id);
          setMove(state);
        }
        return undefined;
      },
      () => undefined,
    );
  }, [api, followMove]);

  const pickFolder = useCallback(async () => {
    try {
      return (await api.assetsFolderPick()).path;
    } catch (error) {
      overlay.toast(`The folder dialog could not be opened: ${apiErrorMessage(error)}`, { tone: 'error' });
      return '';
    }
  }, [api]);
  const startMove = useCallback(
    async (target: string) => {
      try {
        void followMove(await api.assetsMoveStart(target));
        return undefined;
      } catch (error) {
        return apiErrorMessage(error);
      }
    },
    [api, followMove],
  );
  const cancelMove = useCallback(async () => {
    try {
      setMove(await api.assetsMoveCancel());
    } catch (error) {
      overlay.toast(`The move could not be cancelled: ${apiErrorMessage(error)}`, { tone: 'error' });
    }
  }, [api]);
  const dismissMove = useCallback(() => setMove(undefined), []);
  const answerOld = useCallback(
    async (act: () => Promise<void>, done: string) => {
      try {
        await act();
        setAnnouncement(done);
        await refresh();
        return undefined;
      } catch (error) {
        return apiErrorMessage(error);
      }
    },
    [refresh],
  );
  const deleteOld = useCallback(() => answerOld(() => api.assetsMoveDeleteOld(), 'The old copy was deleted.'), [api, answerOld]);
  const keepOld = useCallback(() => answerOld(() => api.assetsMoveKeepOld(), 'The old copy was kept.'), [api, answerOld]);

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
        const installed = status === 'installed';
        return {
          item,
          status,
          percent: job?.percent ?? 0,
          failure,
          checking: installed && checking[key] === true,
          unchecked: installed && unchecked[key] === true,
        };
      }),
    [catalog, jobs, failures, starting, checking, unchecked],
  );
  const viewOf = useCallback((ref: { kind: string; id: string }) => views.find((view) => view.item.kind === ref.kind && view.item.id === ref.id), [views]);

  const value = useMemo<AssetsStore>(
    () => ({
      catalog,
      loadError,
      views,
      viewOf,
      refresh,
      install,
      cancel,
      remove,
      dismissFailure,
      verify,
      announcement,
      move,
      pickFolder,
      startMove,
      cancelMove,
      dismissMove,
      deleteOld,
      keepOld,
    }),
    [
      catalog,
      loadError,
      views,
      viewOf,
      refresh,
      install,
      cancel,
      remove,
      dismissFailure,
      verify,
      announcement,
      move,
      pickFolder,
      startMove,
      cancelMove,
      dismissMove,
      deleteOld,
      keepOld,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * One check of an asset's files: the host's answer, or undefined after the error toast for a refusal or for no answer within VERIFY_WAIT_MS.
 * The toast is raised here, not by the page, so a check that ends after the narrator left Settings is still told once.
 */
async function check(api: Pick<AssetsApi, 'assetsVerify'>, item: AssetItem): Promise<AssetVerifyResult | undefined> {
  let timer: number | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = window.setTimeout(() => resolve('timeout'), VERIFY_WAIT_MS);
  });
  try {
    const answer = await Promise.race([api.assetsVerify(item.kind, item.id), timedOut]);
    if (answer !== 'timeout') return answer;
    const minutes = Math.round(VERIFY_WAIT_MS / 60_000);
    overlay.toast(`The files of ${item.displayName} were not checked: the app did not answer in ${minutes} minutes.`, { tone: 'error' });
  } catch (error) {
    overlay.toast(notChecked(item.displayName, apiErrorMessage(error)), { tone: 'error' });
  } finally {
    window.clearTimeout(timer);
  }
  return undefined;
}

export function useAssetsStore(): AssetsStore {
  const value = useContext(Context);
  if (!value) throw new Error('useAssetsStore needs an AssetsStoreProvider');
  return value;
}
