import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useApi } from '../../api/ApiContext';
import { useAssetInstall } from '../../hooks/useAssetInstall';
import { isInstallRunning } from '../../types';
import { buildRows, creditsRows, hydrateSession, initialSession, previewRows, reduceEvent, type CreditsKind, type Session } from './readerModel';
import { usePacedCursor } from './usePacedCursor';
import type { InputSource } from './listening/listeningMic';
import { PRESS_LIMITS_MS } from './record/pressLimits';
import { hasListeningClaim } from './listening/listeningClaims';
import { apiErrorMessage } from '../../api/errorMessage';
import { logUi } from '../../api/uiLog';
import type {
  ManuscriptChapter,
  ManuscriptParagraph,
  AssetInstallJob,
  TeleprompterDevice,
  TeleprompterEngine,
  TeleprompterEvent,
  TeleprompterPhase,
  TeleprompterStartResult,
  TeleprompterState,
} from '../../types';

export type ModelPrompt = Extract<TeleprompterStartResult, { status: 'asset_required' }>;
type SessionAction = { kind: 'event'; event: TeleprompterEvent } | { kind: 'hydrate'; state: TeleprompterState } | { kind: 'reset' };

/** The live engines by name. Which of them this computer offers is the host's `Teleprompter.engine` choices. */
export const ENGINE_LABELS: Record<TeleprompterEngine, string> = { whisper: 'Whisper', moonshine: 'Moonshine' };
const ENGINE_CAPTIONS: Record<TeleprompterEngine, string> = {
  whisper: 'OpenAI Whisper, run on this computer - the default',
  moonshine: 'Moonshine, a streaming engine run on this computer',
};
const DEFAULT_ENGINE: TeleprompterEngine = 'whisper';
const isEngine = (value: string): value is TeleprompterEngine => value === 'whisper' || value === 'moonshine';
/** The engines the host offers, in its order, as toggle options; an engine this UI does not know is left out. */
const engineOptions = (choices: string[]) =>
  choices.filter(isEngine).map((engine) => ({ value: engine, label: ENGINE_LABELS[engine], title: ENGINE_CAPTIONS[engine] }));
// The earlier browser-storage device value: migrated once into the global settings file and then removed, so it is never read again once the settings value exists. Only the standalone page migrates it
// (see `migrateLegacyDevice` below) - the read-aloud modal never
// had a browser-storage value of its own to migrate.
const LEGACY_DEVICE_KEY = 'narration.teleprompter.device';
const SETTINGS_TOOL = 'Teleprompter';
const INPUT_DEVICE_KEY = 'input_device';
const INPUT_SOURCE_KEY = 'input_source';
const MODEL_KEY = 'model';
const ENGINE_KEY = 'engine';
export const ACTIVE_PHASES: TeleprompterPhase[] = ['starting', 'running', 'stopping'];
const IDLE_STATE: TeleprompterState = { phase: 'idle', message: '', engine: null, chapter: null, script: null, position: null };
/** How long a stop that waits gives the host: its grace before it kills the sidecar (service.go `defaultGrace`, 8 s) and a second more. */
const STOP_WAIT_MS = 9_000;
/**
 * A stop call the binding has not answered by now counts as refused: a limit for a transport that never answers. The real host's `TeleprompterStop` cannot
 * return an error and returns at once (the service kills the sidecar after its 8 s grace in a goroutine), so this only bounds a call that hangs.
 */
const STOP_CALL_MS = 12_000;
/** A refused stop is sent once more after this, if the session is still the one it meant (#3409). */
const STOP_RETRY_MS = 1_500;

function sessionReducer(session: Session, action: SessionAction): Session {
  switch (action.kind) {
    case 'event':
      return reduceEvent(session, action.event);
    case 'hydrate':
      return hydrateSession(session, action.state);
    case 'reset':
      return initialSession;
  }
}

function readLegacyDevice(): string {
  try {
    return window.localStorage.getItem(LEGACY_DEVICE_KEY) ?? '';
  } catch {
    return '';
  }
}

function clearLegacyDevice() {
  try {
    window.localStorage.removeItem(LEGACY_DEVICE_KEY);
  } catch {
    /* nothing to clean up if storage is unavailable */
  }
}

const errorText = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason));

function statusText(host: TeleprompterState, session: Session): string {
  if (host.phase === 'starting') return 'Starting…';
  if (host.phase === 'stopping') return 'Stopping…';
  // The host says why a session stopped (the narrator pressed Stop, or it stopped itself at the end of the chapter).
  if (host.phase === 'stopped') return host.message.trim() || 'Stopped';
  if (host.phase !== 'running') return '';
  // Paused: the tracker's clock is frozen, so it never reports `waiting` or `done` while paused.
  if (host.paused) return 'Paused';
  if (session.position?.status === 'waiting') return 'Waiting for you to return to the script';
  if (session.position?.status === 'done')
    return session.script?.chapter.id.startsWith('credits-')
      ? 'Done - the end of the credits; stopping in a few seconds unless you read on'
      : 'Done - stopping in a few seconds unless you read on';
  return 'Listening';
}

export type UseTeleprompterSessionOptions = {
  /** Empty when nothing is chosen yet (the standalone page before a chapter loads), and while `credits` is chosen. */
  chapterId: string;
  chapter: Pick<ManuscriptChapter, 'title' | 'subtitle'> | undefined;
  /**
   * The opening or closing credits instead of a chapter, with the
   * text the host's one renderer produced (`creditsPreview`); the host renders the same text again for the sidecar.
   */
  credits?: { kind: CreditsKind; text: string };
  /** The standalone page migrates the earlier browser-storage device value once; the read-aloud modal does not (see above). */
  migrateLegacyDevice?: boolean;
};

/**
 * The reading session: host subscription, device and model choice, model-download prompt, start/stop and the rows the
 * reader shows. The Booth page's session and the Companion host call it. Chapter *choice* stays
 * with each caller (the page has a picker; the modal is opened already pointed at one chapter) - callers pass `reset()`
 * after changing `chapterId` themselves.
 */
export function useTeleprompterSession({ chapterId, chapter, credits, migrateLegacyDevice = true }: UseTeleprompterSessionOptions) {
  const api = useApi();
  // The narrator's saved microphone (`input_device`) and whose input to follow while a DAW records (`input_source`).
  const [chosenDevice, setDevice] = useState('');
  const [inputSource, setInputSource] = useState<InputSource>('daw');
  // The microphone a caller resolved to listen on (the Booth: the linked DAW's own input), never saved; null uses the saved one.
  const [listenOn, setListenOn] = useState<string | null>(null);
  const device = listenOn ?? chosenDevice;
  // True once the saved device (if any) has been read, so a caller that fills in a missing device never races the saved one.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [devices, setDevices] = useState<TeleprompterDevice[]>([]);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [model, setModel] = useState('tiny');
  const [engine, setEngine] = useState<TeleprompterEngine>(DEFAULT_ENGINE);
  const [engines, setEngines] = useState(() => engineOptions([DEFAULT_ENGINE]));
  const [host, setHost] = useState<TeleprompterState>(IDLE_STATE);
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const [loaded, setLoaded] = useState<{ chapterId: string; paragraphs: ManuscriptParagraph[] }>();
  const [error, setError] = useState('');
  // The host refused (or never answered) a stop, twice: the session may still be running with the microphone open. Said by the page, once.
  const [stopFailed, setStopFailed] = useState(false);
  const alive = useRef(true);
  // How many sessions this hook has asked for: a refused stop is not sent again once a newer session was asked for.
  const starts = useRef(0);
  // The `starts` count the stop that failed meant, and whether a Retry of it is out: a Retry is only sent for that session, and only once at a time.
  const failedStart = useRef(-1);
  const retrying = useRef(false);
  const [prompt, setPrompt] = useState<ModelPrompt>();
  // The last start found the speech model missing: kept after the question is answered, so a narrator who declined is still told why the text does not follow.
  const [modelMissing, setModelMissing] = useState(false);
  // Engine/model pairs the host's asset list last called installed (#3432). The list is cheap when the manifest vouches for the files and reads every byte
  // of every model when it does not, so a press never waits on it for a model already known to be there: it goes on and the list is read again behind it.
  const installedModels = useRef(new Set<string>());
  // Where the next Start begins (the read-aloud dialog's resume card):
  // null is the top. Passed to the host as `startWord` (start at a word), so a resumed session
  // never reads from the top first.
  // A ref, not state: the page moves it on every step, and only Start reads it. As state it re-rendered the page for each step, and a step
  // that came before the last one's render ended chained into React's maximum update depth (#2630).
  const startWordRef = useRef<number | null>(null);
  const setStartWord = useCallback((word: number | null) => {
    startWordRef.current = word;
  }, []);
  // The model download: the shared install-poll hook, through the generic asset bindings, since the missing model is either
  // engine's (the gate's answer names the engine, which is also the asset kind). A session must not start on a view the narrator has
  // already left: the hook stops and never calls onSuccess once this hook's owner has unmounted.
  // The install question was asked by a choice or by Record, not by a session that already started: when it is answered the model is
  // only installed, nothing starts. `revert` puts a choice back when the question is closed without a download.
  const gate = useRef<{ revert?: () => void } | null>(null);
  const modelInstall = useAssetInstall<AssetInstallJob>({
    start: () => {
      if (!prompt) return Promise.reject(new Error('Start reading first.'));
      return api.assetsInstall(prompt.engine, prompt.model.id);
    },
    state: (jobId) => api.assetsInstallState(jobId),
    cancel: (jobId) => api.assetsInstallCancel(jobId),
    onSuccess: async () => {
      setPrompt(undefined);
      if (gate.current) {
        gate.current = null;
        return;
      }
      await start();
    },
  });

  const active = ACTIVE_PHASES.includes(host.phase);
  // Each session starts over: its cursor is the word it was started at until it reports one (`startedAt`, set by this hook's own
  // Start, else the top), and the paced cursor lands there instead of walking from where the last session was (`epoch`).
  const startedAt = useRef(0);
  const [epoch, setEpoch] = useState({ count: 0, at: 0 });
  const cursor = usePacedCursor(session.position ? session.cursor : epoch.at, epoch.count);
  // A cold read (#2251 item 13): the running session, or the last one, follows the narrator with no take.
  const coldRead = Boolean(host.coldRead);
  // Its flags are never a take's: no reader (the suspected lines, the Companion's findings) is given them.
  const shown = useMemo(() => (coldRead && session.flags.length > 0 ? { ...session, flags: [] } : session), [coldRead, session]);
  // Stops that wait for the host to say the session has ended (`stopAndWait`).
  const stopWaiters = useRef(new Set<() => void>());
  const hostPhase = useRef(host.phase);
  hostPhase.current = host.phase;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const stopEvents = api.subscribeTeleprompterEvent((event) => dispatch({ kind: 'event', event }));
    const stopState = api.subscribeTeleprompterState((next) => {
      setHost(next);
      if (next.phase === 'starting') {
        dispatch({ kind: 'reset' });
        setEpoch((last) => ({ count: last.count + 1, at: startedAt.current }));
      }
      if (!ACTIVE_PHASES.includes(next.phase)) {
        setStopFailed(false);
        stopWaiters.current.forEach((done) => done());
        stopWaiters.current.clear();
      }
    });
    void api
      .teleprompterState()
      .then((state) => {
        setHost((current) => (current.phase === 'idle' ? state : current));
        dispatch({ kind: 'hydrate', state });
      })
      .catch(() => {});
    return () => {
      stopEvents();
      stopState();
    };
  }, [api]);

  const loadDevices = useCallback(() => {
    setDevicesLoading(true);
    void api
      .teleprompterDevices()
      .then((result) => {
        setDevices(result.devices);
        setDevicesError(result.error);
      })
      .catch((reason) => setDevicesError(errorText(reason)))
      .finally(() => setDevicesLoading(false));
  }, [api]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // Loads the persisted device once (global settings), and
  // migrates the earlier browser-storage value into it exactly once (page only, see `migrateLegacyDevice`).
  // Also reads the Teleprompter settings section's default model so a session starts with whichever model the
  // narrator set in Settings, without forcing a per-session choice here.
  useEffect(() => {
    let live = true;
    void api
      .settingsForScope('global')
      .then((settings) => {
        if (!live) return;
        const fields = settings[SETTINGS_TOOL] ?? [];
        setSettingsLoaded(true);
        const sourceField = fields.find((item) => item.key === INPUT_SOURCE_KEY);
        setInputSource(sourceField?.effectiveValue === 'chosen' ? 'chosen' : 'daw');
        const deviceField = fields.find((item) => item.key === INPUT_DEVICE_KEY);
        if (deviceField?.isSet) {
          setDevice(deviceField.value);
        } else if (migrateLegacyDevice) {
          const legacy = readLegacyDevice();
          if (legacy) {
            setDevice(legacy);
            clearLegacyDevice();
            void api.saveSettings(SETTINGS_TOOL, 'global', { [INPUT_DEVICE_KEY]: legacy }).catch(() => {});
          }
        }
        const modelField = fields.find((item) => item.key === MODEL_KEY);
        if (modelField?.effectiveValue) setModel(modelField.effectiveValue);
        // The engines are the ones the host can launch on this computer (its choices for the setting), so an engine it
        // does not offer is never shown or sent.
        const engineField = fields.find((item) => item.key === ENGINE_KEY);
        const offered = engineOptions(engineField?.choices ?? [DEFAULT_ENGINE]);
        if (offered.length > 0) setEngines(offered);
        const chosen = engineField?.effectiveValue ?? '';
        if (isEngine(chosen) && offered.some((option) => option.value === chosen)) setEngine(chosen);
      })
      .catch(() => live && setSettingsLoaded(true));
    return () => {
      live = false;
    };
  }, [api, migrateLegacyDevice]);

  useEffect(() => {
    if (!chapterId) return;
    let live = true;
    void api
      .manuscriptParagraphs(chapterId)
      .then((paragraphs) => live && setLoaded({ chapterId, paragraphs }))
      .catch((reason) => live && setError(errorText(reason)));
    return () => {
      live = false;
    };
  }, [api, chapterId]);

  const paragraphs = loaded?.chapterId === chapterId ? loaded.paragraphs : undefined;
  const creditsKind = credits?.kind;
  const creditsText = credits?.text;
  const rows = useMemo(() => {
    if (creditsKind && creditsText !== undefined) {
      // A session still describing a chapter (or the other credits) is not these credits' script.
      const script = session.script?.chapter.id === `credits-${creditsKind}` ? session.script : null;
      return creditsRows(creditsKind, creditsText, script);
    }
    if (!chapter || !paragraphs) return [];
    return session.script ? buildRows(session.script, chapter, paragraphs) : previewRows(chapter, paragraphs);
  }, [creditsKind, creditsText, chapter, paragraphs, session.script]);

  /**
   * Starts listening. The host answers once the session is listening, or fails when it could not start; `ok` says which, `reason` is why not.
   * `coldRead` starts a cold read; `startWord`, when given, is where it begins instead of the one `setStartWord` chose (null is the top).
   */
  const start = async (options: { coldRead?: boolean; startWord?: number | null } = {}): Promise<{ ok: boolean; reason: string }> => {
    setError('');
    setStopFailed(false);
    starts.current += 1;
    setModelMissing(false);
    const from = options.startWord === undefined ? startWordRef.current : options.startWord;
    startedAt.current = from ?? 0;
    try {
      const source = creditsKind ? { credits: creditsKind } : { chapter: chapterId };
      const result = await api.teleprompterStart({
        ...source,
        device: device.trim(),
        engine,
        model,
        ...(from === null ? {} : { startWord: from }),
        ...(options.coldRead ? { coldRead: true } : {}),
      });
      if (result.status === 'asset_required') {
        setModelMissing(true);
        installedModels.current.delete(`${engine}/${model}`);
        modelInstall.reset();
        setPrompt(result);
        return { ok: false, reason: 'the speech model is not downloaded' };
      }
      return { ok: true, reason: '' };
    } catch (reason) {
      const text = errorText(reason);
      setError(text);
      return { ok: false, reason: text };
    } finally {
      // The host has said `starting` by now if it started: a session someone else starts begins at the top as before.
      startedAt.current = 0;
    }
  };
  /**
   * Asks the host to end the session it runs, and sends the stop once more if it was refused or never answered (#3409): a session left running keeps the microphone
   * open and a later start finds it "already running". True when the host took the stop or said the session had ended. After the second failure `stopFailed`
   * is set, unless this hook is gone (an unmount's stop that fails is unknown, not failed, and says nothing). The second stop is sent only if the session it
   * meant is still the one the host runs: nothing was started since and no press holds a claim on a session (a take that joined it would lose its listening).
   */
  const stopHost = useCallback(async (): Promise<boolean> => {
    const attempt = () =>
      new Promise<boolean>((resolve) => {
        const ended = () => finish(true);
        const finish = (ok: boolean) => {
          clearTimeout(timer);
          stopWaiters.current.delete(ended);
          resolve(ok);
        };
        const timer = setTimeout(() => {
          logUi('ui.record', 'The host did not answer a stop of the listening session in time.');
          finish(false);
        }, STOP_CALL_MS);
        // The host saying the session has ended is the answer, whatever the call returns.
        stopWaiters.current.add(ended);
        api.teleprompterStop().then(
          () => finish(true),
          (reason: unknown) => {
            logUi('ui.record', `The host refused to stop the listening session: ${apiErrorMessage(reason)}`);
            finish(false);
          },
        );
      });
    const before = starts.current;
    if (await attempt()) return true;
    await new Promise((resolve) => setTimeout(resolve, STOP_RETRY_MS));
    if (!alive.current) return false;
    // The session ended meanwhile, or is not the one the first stop meant: nothing to stop.
    if (!ACTIVE_PHASES.includes(hostPhase.current) || starts.current !== before || hasListeningClaim()) return true;
    if (await attempt()) return true;
    if (alive.current) {
      failedStart.current = before;
      setStopFailed(true);
    }
    return false;
  }, [api]);
  const stop = () => void stopHost();
  /**
   * The Retry of the stop-failed sentence. It sends the stop again only if the session it meant is still the one the host runs, under the conditions the
   * automatic second stop has: this hook still there, the session not ended, nothing started since, no press holding a claim on it (a take that joined it
   * would lose its listening). Otherwise nothing is sent: the reason for the sentence is gone. `stopFailed` clears first, so a Retry that is refused twice
   * raises the sentence again. A second press while one is out does nothing.
   */
  const retryStop = useCallback(() => {
    if (retrying.current) return;
    const meant = alive.current && ACTIVE_PHASES.includes(hostPhase.current) && starts.current === failedStart.current && !hasListeningClaim();
    setStopFailed(false);
    if (!meant) return;
    retrying.current = true;
    void stopHost().finally(() => {
      retrying.current = false;
    });
  }, [stopHost]);
  /**
   * A press took the running session (a take that joined it, with or without a claim): the sentence about a stop that failed no longer describes it, and
   * neither the automatic retry nor a Retry may stop it. A join counts like a start for them (`starts`).
   */
  const sessionJoined = useCallback(() => {
    starts.current += 1;
    setStopFailed(false);
  }, []);
  /**
   * Stops the session and answers once the host says it has ended (a new session can start then), or after STOP_WAIT_MS when the host
   * never says, so a take is never held behind it. Answers at once when nothing runs.
   */
  /**
   * Answers when a session the host is starting (another press's, whose Booth may be gone) is up or has failed, as `start` does for its own: a press that joins
   * it must not keep a take on a session that then fails. It listens to the host itself, not through this hook's subscription, so it still hears the answer
   * when the Booth that asked has been left or the chapter has changed. Answers at once when none is starting.
   */
  const whenUp = useCallback((): Promise<{ ok: boolean; reason: string }> => {
    const answer = (state: TeleprompterState) =>
      state.phase === 'running' ? { ok: true, reason: '' } : { ok: false, reason: state.message || 'listening failed' };
    return new Promise((resolve) => {
      let off = () => {};
      let settled = false;
      const timer: { id?: ReturnType<typeof setTimeout> } = {};
      const finish = (state: TeleprompterState) => {
        if (settled || state.phase === 'starting') return;
        settled = true;
        clearTimeout(timer.id);
        off();
        resolve(answer(state));
      };
      off = api.subscribeTeleprompterState(finish);
      // The press that waits gave up at its limit: the listener goes with it, so a host that never pushes leaves nothing behind.
      timer.id = setTimeout(() => {
        if (settled) return;
        settled = true;
        off();
        resolve({ ok: false, reason: 'no answer in time' });
      }, PRESS_LIMITS_MS.listening + 1000);
      void api
        .teleprompterState()
        .then(finish)
        // A read that fails claims nothing: the host's push still answers.
        .catch(() => null);
    });
  }, [api]);
  /** Ends a session the host runs or is starting, if there is one: for a press that gave up on a session nobody else owns. */
  const stopIfRunning = useCallback(async (): Promise<void> => {
    const state = await api.teleprompterState().catch(() => null);
    if (state && ACTIVE_PHASES.includes(state.phase)) await stopHost();
  }, [api, stopHost]);
  const stopAndWait = useCallback((): Promise<void> => {
    if (!ACTIVE_PHASES.includes(hostPhase.current)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, STOP_WAIT_MS);
      function done() {
        clearTimeout(timer);
        stopWaiters.current.delete(done);
        resolve();
      }
      stopWaiters.current.add(done);
      void stopHost().then((ok) => ok || done());
    });
  }, [stopHost]);
  // Pause (true) or resume (false) a running session's listening without ending it: the phase stays `running`, so `active` and every "is a session running" check stay as they are; only
  // `host.paused` changes. Flags are kept on Stop only (docs/architecture/findings-contract.md unchanged).
  const pause = (paused: boolean) => void api.teleprompterPause(paused).catch((reason) => setError(errorText(reason)));
  // Moves a running tracker straight to a chosen script word ("Start here" / "Go back to here", wired to a word click through
  // `ReaderText`'s `onSeek`). `useCallback` keeps this a stable
  // reference across renders: `ReaderText` passes it into a `memo`-wrapped per-row component, and a fresh closure every
  // render would defeat that row-level memoization (see `ReaderText.tsx`).
  const seek = useCallback((word: number) => void api.teleprompterSeek(word).catch((reason) => setError(errorText(reason))), [api]);

  const closeModelPrompt = () => {
    // A choice that asked for a download and was closed without one is put back, so the app never holds an engine it cannot run.
    if (gate.current?.revert && !isInstallRunning(modelInstall.job ?? { phase: 'success' })) gate.current.revert();
    gate.current = null;
    setPrompt(undefined);
    modelInstall.reset();
  };

  /**
   * Asks the install question when `engine` and `model` are not on this computer: the host's asset list says, and a list that cannot be read
   * claims nothing. True when the model is there (or unknown), false when the question was opened instead. `revert` runs if it is closed
   * without a download. A take must never begin behind this question, so Record calls this first. `abandoned` says the caller gave up waiting: the
   * question is then never opened.
   */
  const ensureModel = async (
    which: { engine: string; model: string } = { engine, model },
    revert?: () => void,
    abandoned?: () => boolean,
  ): Promise<boolean> => {
    if (!isEngine(which.engine)) return true;
    const key = `${which.engine}/${which.model}`;
    const find = (catalog: Awaited<ReturnType<typeof api.assetsList>>) => catalog.assets.find((item) => item.kind === which.engine && item.id === which.model);
    if (installedModels.current.has(key)) {
      // Known installed: no wait. The list is read again behind the press and only forgets the answer (the next press asks, and the question opens then).
      void api
        .assetsList()
        .then((catalog) => {
          const asset = find(catalog);
          if (asset && asset.installState !== 'installed') installedModels.current.delete(key);
        })
        .catch(() => installedModels.current.delete(key));
      return true;
    }
    try {
      const catalog = await api.assetsList();
      const asset = find(catalog);
      if (asset?.installState === 'installed') installedModels.current.add(key);
      // The press gave up on this check (it said so and is over): a question opened now would arrive out of nowhere, or over a take that runs.
      if (abandoned?.()) return true;
      if (!asset || asset.installState === 'installed') return true;
      installedModels.current.delete(key);
      gate.current = { revert };
      setModelMissing(true);
      modelInstall.reset();
      setPrompt({
        status: 'asset_required',
        engine: which.engine,
        model: {
          id: asset.id,
          provider: asset.kind,
          displayName: asset.displayName,
          version: asset.version,
          publisher: asset.publisher,
          license: asset.license,
          licenseUrl: asset.licenseUrl,
          modelCardUrl: asset.modelCardUrl,
          provenanceUrl: asset.provenanceUrl,
          attribution: asset.attribution,
        },
        installState: asset.installState,
        downloadSize: asset.downloadSize,
        diskSize: asset.diskSize,
        installPath: asset.path,
      });
      return false;
    } catch {
      return true;
    }
  };

  // Device, engine and model are machine facts kept in the global settings, so a choice made
  // here is the one Settings shows and the next session starts with. Choosing never downloads: a missing model is asked for at Start.
  const saveChoice = (key: string, value: string) =>
    void api.saveSettings(SETTINGS_TOOL, 'global', { [key]: value }).catch((reason) => setError(errorText(reason)));
  const changeDevice = (value: string) => {
    setDevice(value);
    saveChoice(INPUT_DEVICE_KEY, value);
  };
  // "Choose a different one": the narrator's microphone, kept even while a DAW records, until `followDaw`.
  const chooseOverDaw = (value: string) => {
    setInputSource('chosen');
    setDevice(value);
    void api.saveSettings(SETTINGS_TOOL, 'global', { [INPUT_DEVICE_KEY]: value, [INPUT_SOURCE_KEY]: 'chosen' }).catch((reason) => setError(errorText(reason)));
  };
  // Back to the linked DAW's own input. The saved microphone stays, for when no DAW records.
  const followDaw = () => {
    setInputSource('daw');
    saveChoice(INPUT_SOURCE_KEY, 'daw');
  };
  const changeEngine = (value: string) => {
    if (!isEngine(value)) return;
    const before = engine;
    setEngine(value);
    saveChoice(ENGINE_KEY, value);
    // Choosing an engine whose model is not here asks for the download now, and puts the engine back if it is not downloaded.
    void ensureModel({ engine: value, model }, () => {
      setEngine(before);
      saveChoice(ENGINE_KEY, before);
    });
  };
  const changeModel = (value: string) => {
    const before = model;
    setModel(value);
    saveChoice(MODEL_KEY, value);
    void ensureModel({ engine, model: value }, () => {
      setModel(before);
      saveChoice(MODEL_KEY, before);
    });
  };

  const reset = () => dispatch({ kind: 'reset' });

  const status = statusText(host, session);
  // A failed or empty device listing blocks Start (the microphone is never typed):
  // there is no typed fallback to start with, so Start stays disabled until a device can be chosen from the list.
  const micBlockedReason = devices.length === 0 ? (devicesError ? "Couldn't list microphones." : 'No microphone found.') : undefined;
  const hasSource = Boolean(chapterId || creditsKind);
  const canStart = hasSource && device.trim() !== '' && !micBlockedReason;
  const startReason = !hasSource
    ? 'Choose a chapter first.'
    : micBlockedReason
      ? micBlockedReason
      : device.trim() === ''
        ? 'Choose a microphone first.'
        : 'Start reading';

  return {
    host,
    paused: Boolean(host.paused),
    pause,
    session: shown,
    coldRead,
    device,
    chosenDevice,
    inputSource,
    listenOn: setListenOn,
    chooseOverDaw,
    followDaw,
    settingsLoaded,
    devices,
    devicesError,
    devicesLoading,
    loadDevices,
    model,
    changeModel,
    engine,
    engines,
    changeEngine,
    paragraphs,
    rows,
    cursor,
    active,
    status,
    error,
    stopFailed,
    retryStop,
    sessionJoined,
    prompt,
    modelMissing,
    modelInstall,
    start,
    stop,
    stopAndWait,
    whenUp,
    stopIfRunning,
    phase: host.phase,
    seek,
    changeDevice,
    closeModelPrompt,
    ensureModel,
    setStartWord,
    reset,
    canStart,
    startReason,
  };
}

export type TeleprompterSession = ReturnType<typeof useTeleprompterSession>;
