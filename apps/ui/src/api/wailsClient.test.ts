// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Call } from '@wailsio/runtime';

import { wailsClient } from './wailsClient';
import { WireError } from './wire/WireError';

// The generated bindings call the host through @wailsio/runtime (Wails v3). Each test stands a fake host in front of them: every
// generated function forwards to the method of the same name in `fakeHost`, and a method the test did not give is missing, as an
// unbound one would be. Events.On hands its listener a WailsEvent, whose `data` is what the host emitted, as the runtime does.
type Listener = (payload: unknown) => void;
type EventsOn = (event: string, listener: Listener) => () => void;
const fake: { host: Record<string, unknown>; eventsOn: EventsOn | undefined } = { host: {}, eventsOn: undefined };

function standInHost(methods: Record<string, unknown>): void {
  fake.host = methods;
}

function standInEvents(eventsOn: EventsOn): void {
  fake.eventsOn = eventsOn;
}

vi.mock('../../wailsjs/github.com/countrymanprime/narration-utils/shell/host', async (importOriginal) => {
  const generated = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(
    Object.keys(generated).map((name) => [
      name,
      (...args: unknown[]) => {
        const method = fake.host[name];
        if (typeof method !== 'function') throw new TypeError(`the fake host has no ${name}`);
        return method(...args);
      },
    ]),
  );
});

vi.mock('@wailsio/runtime', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Events: {
    On: (event: string, listener: (wailsEvent: { name: string; data: unknown }) => void) => {
      if (!fake.eventsOn) throw new TypeError('the test did not stand in for Events.On');
      return fake.eventsOn(event, (payload) => listener({ name: event, data: payload }));
    },
  },
}));

afterEach(() => {
  fake.host = {};
  fake.eventsOn = undefined;
});

describe('wailsClient', () => {
  it('lists the recording check engines and sends a named model as the model option', async () => {
    const engines = { engines: [{ id: 'small', label: 'Small', family: 'whisper', installState: 'installed' }], default: 'small' };
    const start = vi.fn().mockResolvedValue(JSON.stringify({ status: 'refused', reason: 'busy', message: 'A check is already running.' }));
    standInHost({ CoverageEngines: () => Promise.resolve(JSON.stringify(engines)), CoverageStart: start });

    await expect(wailsClient.coverageEngines()).resolves.toEqual(engines);
    await wailsClient.coverageStart('c-1', { model: 'base' });
    await wailsClient.coverageStart('c-1', { skipRecheck: true, model: 'small' });
    await wailsClient.coverageStart('c-1');
    expect(start.mock.calls).toEqual([
      ['c-1', { model: 'base' }],
      ['c-1', { skipRecheck: 'true', model: 'small' }],
      ['c-1', {}],
    ]);
  });

  it('sends the Story Bible review flags and speaker colour calls, with null for an omitted alias index', async () => {
    const marked = vi.fn().mockResolvedValue('null');
    const flagged = vi.fn().mockResolvedValue('null');
    const coloured = vi.fn().mockResolvedValue('null');
    standInHost({ GuideMarkReviewed: marked, GuideFlagReview: flagged, GuideSetSpeakerColor: coloured });

    await expect(wailsClient.guideMarkReviewed('e-1')).resolves.toBeUndefined();
    await wailsClient.guideMarkReviewed('e-1', 2);
    await wailsClient.guideFlagReview('e-1');
    await wailsClient.guideFlagReview('e-1', 0);
    await wailsClient.guideSetSpeakerColor('e-1', 4);
    await wailsClient.guideSetSpeakerColor('e-1', null);
    expect(marked.mock.calls).toEqual([
      ['e-1', null],
      ['e-1', 2],
    ]);
    expect(flagged.mock.calls).toEqual([
      ['e-1', null],
      ['e-1', 0],
    ]);
    expect(coloured.mock.calls).toEqual([
      ['e-1', 4],
      ['e-1', null],
    ]);
  });

  it('accepts, ignores and reads the reviews of a recording check gap by ids only', async () => {
    const finding = {
      schema_version: 1,
      id: 'f-1',
      analyzer: 'recording-check',
      project: {},
      source: {},
      category: 'pickup',
      severity: 'info',
      confidence: null,
      confidence_reason: 'no_word_scores',
      review: { status: 'accepted' },
    };
    const accept = vi.fn().mockResolvedValue(JSON.stringify(finding));
    const ignore = vi.fn().mockResolvedValue('null');
    const reviews = vi.fn().mockResolvedValue(JSON.stringify({ 'missing:p-1:3': 'accepted', 'extra:p-1:9': 'ignored' }));
    standInHost({ CoverageGapAccept: accept, CoverageGapIgnore: ignore, CoverageGapReviews: reviews });

    await expect(wailsClient.coverageGapAccept('c-1', 'missing:p-1:3')).resolves.toMatchObject({ id: 'f-1', category: 'pickup' });
    await expect(wailsClient.coverageGapIgnore('c-1', 'extra:p-1:9')).resolves.toBeUndefined();
    await expect(wailsClient.coverageGapReviews('c-1')).resolves.toEqual({ 'missing:p-1:3': 'accepted', 'extra:p-1:9': 'ignored' });
    expect(accept).toHaveBeenCalledWith('c-1', 'missing:p-1:3');
    expect(ignore).toHaveBeenCalledWith('c-1', 'extra:p-1:9');
    expect(reviews).toHaveBeenCalledWith('c-1');

    reviews.mockResolvedValueOnce(JSON.stringify({ gap: 'dismissed' }));
    await expect(wailsClient.coverageGapReviews('c-1')).rejects.toThrow();
  });

  it('uses generated Wails methods rather than an operation-string transport', async () => {
    const select = vi.fn().mockResolvedValue(JSON.stringify({ selected: true, jobId: 'import-1' }));
    standInHost({ Ready: () => Promise.resolve({ apiVersion: 1, diagnosticId: 'native' }), ManuscriptSelectFile: select });

    await expect(wailsClient.ready()).resolves.toEqual({ apiVersion: 1, diagnosticId: 'native' });
    await expect(wailsClient.selectManuscript()).resolves.toEqual({ selected: true, jobId: 'import-1' });
    expect(select).toHaveBeenCalledWith();
  });

  it('picks, measures, polls and cancels a measurement through the native bindings and the job schema', async () => {
    const job = {
      id: 'measure-1',
      kind: 'measurement',
      phase: 'running',
      message: 'Measuring 1 file.',
      percent: 0,
      logs: null,
      elapsed: 0,
      files: null,
      profile: null,
      bookRules: null,
    };
    const pick = vi.fn().mockResolvedValue(JSON.stringify({ paths: ['C:/R/Chapter 01.wav'] }));
    const analyze = vi.fn().mockResolvedValue(JSON.stringify(job));
    const state = vi.fn().mockResolvedValue(JSON.stringify({ ...job, phase: 'success', percent: 100 }));
    const cancel = vi.fn().mockResolvedValue(JSON.stringify({ ...job, phase: 'cancelled' }));
    standInHost({ MeasurePickFiles: pick, MeasureAnalyze: analyze, MeasureState: state, MeasureCancel: cancel });

    const picked = await wailsClient.measurePickFiles();
    expect(picked).toEqual({ paths: ['C:/R/Chapter 01.wav'] });
    await expect(wailsClient.measureAnalyze(picked.paths)).resolves.toMatchObject({ phase: 'running', logs: [], files: [] });
    expect(analyze).toHaveBeenCalledWith(['C:/R/Chapter 01.wav']);
    await expect(wailsClient.measureState()).resolves.toMatchObject({ phase: 'success', percent: 100 });
    await expect(wailsClient.measureCancel()).resolves.toMatchObject({ phase: 'cancelled' });
  });

  it('checks, polls and cancels diagnostics through the native bindings and the job schema', async () => {
    const thresholds = {
      clip_ceiling_dbfs: 0,
      silence_floor_dbfs: -50,
      min_silence_seconds: 0.3,
      level_shift_lu: 4,
      room_tone_step_db: 6,
      pauses: { min_pause_seconds: 0.3, long_pause_seconds: 2 },
    };
    const cleanupThresholds = {
      pad_seconds: 0.15,
      min_breath_seconds: 0.12,
      max_breath_seconds: 0.9,
      breath_below_speech_db: 12,
      click_above_silence_db: 30,
    };
    const job = {
      id: 'diagnostics-1',
      kind: 'diagnostics',
      phase: 'running',
      message: 'Checking 1 file.',
      percent: 0,
      logs: null,
      elapsed: 0,
      sourceKind: 'raw_recording',
      thresholds,
      cleanupThresholds,
      files: null,
    };
    const analyze = vi.fn().mockResolvedValue(JSON.stringify(job));
    const state = vi.fn().mockResolvedValue(JSON.stringify({ ...job, phase: 'success', percent: 100 }));
    const cancel = vi.fn().mockResolvedValue(JSON.stringify({ ...job, phase: 'cancelled' }));
    standInHost({ DiagnosticsAnalyze: analyze, DiagnosticsState: state, DiagnosticsCancel: cancel });

    await expect(wailsClient.diagnosticsAnalyze(['C:/R/Chapter 01.wav'], 'raw_recording')).resolves.toMatchObject({ phase: 'running', logs: [], files: [] });
    expect(analyze).toHaveBeenCalledWith(['C:/R/Chapter 01.wav'], 'raw_recording');
    await expect(wailsClient.diagnosticsState()).resolves.toMatchObject({ phase: 'success', percent: 100 });
    await expect(wailsClient.diagnosticsCancel()).resolves.toMatchObject({ phase: 'cancelled' });
  });

  it('rejects a measurement whose level is a number the host never sends', async () => {
    const report = { sample_rate: 48000, channels: 2, duration_seconds: 1, integrated_lufs: '-19', rms_dbfs: null, sample_peak_dbfs: null };
    const job = {
      id: 'measure-1',
      kind: 'measurement',
      phase: 'success',
      message: '',
      percent: 100,
      logs: [],
      elapsed: 0,
      files: [{ path: 'a', name: 'a', status: 'measured', report, fingerprint: null }],
    };
    standInHost({ MeasureState: () => Promise.resolve(JSON.stringify(job)), SystemReportDiagnostic: vi.fn().mockResolvedValue('null') });
    await expect(wailsClient.measureState()).rejects.toBeInstanceOf(WireError);
  });

  it('accepts the idle Bootstrap the host sends, with nulls for unset transcript fields and no marker export', async () => {
    const idle = {
      runId: null,
      phase: 'idle',
      percent: 0,
      message: '',
      logs: [],
      chapters: [],
      rows: [],
      diff: '',
      summary: '',
      trackName: null,
      audioItemCount: null,
      completedAt: null,
      elapsed: 0,
    };
    const bootstrap = {
      apiVersion: 6,
      diagnosticId: 'go-1',
      version: '0.2.7',
      projectFolder: 'C:/P',
      projectName: 'P',
      daw: 'reaper',
      manuscript: null,
      manuscriptCandidate: null,
      runtime: { Reaper: { launcherPath: '' } },
      transcript: idle,
    };
    standInHost({ Bootstrap: () => Promise.resolve(bootstrap) });

    const parsed = await wailsClient.bootstrap();

    expect(parsed.transcript.runId).toBeUndefined();
    expect(parsed.transcript.markerExport).toEqual({ phase: 'idle', message: '', added: 0, skipped: 0 });
  });

  it('rejects a Bootstrap with the wrong shape as a WireError and writes it to the host log without values', async () => {
    const report = vi.fn().mockResolvedValue('null');
    standInHost({
      Bootstrap: () => Promise.resolve({ apiVersion: 6, version: '0.2.7', projectName: 'A SECRET TITLE', transcript: 'nope' }),
      SystemReportDiagnostic: report,
    });

    await expect(wailsClient.bootstrap()).rejects.toBeInstanceOf(WireError);

    expect(report).toHaveBeenCalledTimes(1);
    const [kind, message] = report.mock.calls[0] as [string, string];
    expect(kind).toBe('wire_invalid');
    expect(message).toContain('host.binding Bootstrap');
    expect(message).toContain('transcript');
    expect(message).not.toContain('SECRET');
  });

  it('still throws the WireError when there is no host to report to', async () => {
    standInHost({ Ready: () => Promise.resolve({ diagnosticId: 'x' }) });
    await expect(wailsClient.ready()).rejects.toBeInstanceOf(WireError);
  });

  it('rejects a host binding that answers with text that is not JSON', async () => {
    standInHost({ SystemReportDiagnostic: () => Promise.resolve('<html>') });
    await expect(wailsClient.reportClientDiagnostic('k', 'm')).rejects.toBeInstanceOf(WireError);
  });

  it('subscribes once to the transcript state event and normalizes marker export state', () => {
    let callback: ((payload: unknown) => void) | undefined;
    const eventsOn = vi.fn((_event: string, listener: (payload: unknown) => void) => {
      callback = listener;
      return () => {};
    });
    standInEvents(eventsOn);
    const update = vi.fn();

    wailsClient.subscribeTranscript(update);
    callback?.({ phase: 'running', percent: 10, message: 'Working', logs: [], chapters: [], rows: [], diff: '', summary: '', elapsed: 1 });

    expect(eventsOn).toHaveBeenCalledWith('transcript:state', expect.any(Function));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ markerExport: { phase: 'idle', message: '', added: 0, skipped: 0 } }));
  });

  it('reads the update status through its schema and reports a payload that does not match', async () => {
    const status = {
      version: '0.2.6',
      development: false,
      platform: 'windows-x64',
      channel: 'candidates',
      canInstall: true,
      installBlockedReason: '',
      downloaded: null,
      lastChecked: '',
      failure: '',
      available: null,
    };
    const report = vi.fn().mockResolvedValue('null');
    standInHost({
      UpdateStatus: () => Promise.resolve(JSON.stringify(status)),
      UpdateCheck: () => Promise.resolve('{"version":3}'),
      SystemReportDiagnostic: report,
    });

    await expect(wailsClient.updateStatus()).resolves.toEqual(status);
    await expect(wailsClient.updateCheck()).rejects.toBeInstanceOf(WireError);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('enters and exits companion mode through its error-only bindings, and turns a host error into its text', async () => {
    const enter = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn().mockResolvedValue(null);
    standInHost({ CompanionModeEnter: enter, CompanionModeExit: exit });
    await expect(wailsClient.companionModeEnter()).resolves.toBeUndefined();
    await expect(wailsClient.companionModeExit()).resolves.toBeUndefined();
    expect(enter).toHaveBeenCalledWith();
    expect(exit).toHaveBeenCalledWith();

    standInHost({ CompanionModeEnter: () => Promise.reject(new Error('host is not ready')) });
    await expect(wailsClient.companionModeEnter()).rejects.toThrow('host is not ready');
  });

  it('opens the release notes through a binding that takes no address', async () => {
    const open = vi.fn().mockResolvedValue('null');
    standInHost({ UpdateOpenNotes: open });
    await expect(wailsClient.updateOpenNotes()).resolves.toBeUndefined();
    expect(open).toHaveBeenCalledWith();
  });

  it('starts, polls and cancels an update download through the job schema', async () => {
    const job = { id: 'update-1', version: '0.2.7', phase: 'downloading', message: 'Downloading', percent: 40, bytesDone: 4, bytesTotal: 10, error: '' };
    const cancel = vi.fn().mockResolvedValue(JSON.stringify({ ...job, phase: 'cancelled' }));
    standInHost({
      UpdateDownload: () => Promise.resolve(JSON.stringify(job)),
      UpdateJobState: () => Promise.resolve(JSON.stringify({ ...job, phase: 'verifying', percent: 100 })),
      UpdateJobCancel: cancel,
    });

    await expect(wailsClient.updateDownload()).resolves.toEqual(job);
    await expect(wailsClient.updateJobState('update-1')).resolves.toMatchObject({ phase: 'verifying' });
    await expect(wailsClient.updateJobCancel('update-1')).resolves.toMatchObject({ phase: 'cancelled' });
    expect(cancel).toHaveBeenCalledWith('update-1');
  });

  it('subscribes to the update event and passes a status that matches its schema', () => {
    let callback: ((payload: unknown) => void) | undefined;
    const eventsOn = vi.fn((_event: string, listener: (payload: unknown) => void) => {
      callback = listener;
      return () => {};
    });
    standInEvents(eventsOn);
    const seen = vi.fn();

    wailsClient.subscribeUpdate(seen);
    callback?.({
      version: '0.2.6',
      development: false,
      platform: 'windows-x64',
      channel: 'stable',
      canInstall: false,
      installBlockedReason: 'x',
      downloaded: null,
      lastChecked: 'x',
      failure: '',
      available: null,
    });

    expect(eventsOn).toHaveBeenCalledWith('update:status', expect.any(Function));
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ channel: 'stable' }));
  });

  it('forwards checked character candidates when committing a manuscript import', async () => {
    const commit = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ id: 'import-1', kind: 'manuscript_import', phase: 'success', message: '', percent: 100, logs: [], elapsed: 0 }));
    standInHost({ ManuscriptImportCommit: commit });

    await wailsClient.manuscriptImportCommit('import-1', {
      confirmedReset: false,
      selection: { sectionKinds: { 's-1': 'narration' }, characterCandidateIds: ['candidate-1', 'candidate-2'] },
    });

    expect(commit).toHaveBeenCalledWith('import-1', false, { 's-1': 'narration' }, ['candidate-1', 'candidate-2'], {});
  });

  it('forwards the subtitles the narrator turned off when committing a manuscript import', async () => {
    const commit = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ id: 'import-1', kind: 'manuscript_import', phase: 'success', message: '', percent: 100, logs: [], elapsed: 0 }));
    standInHost({ ManuscriptImportCommit: commit });

    await wailsClient.manuscriptImportCommit('import-1', { confirmedReset: true, selection: { subtitleDefault: false, subtitleOverrides: { 's-1': false } } });

    // The review's default is resolved into the overrides before the commit: the host never receives it.
    expect(commit).toHaveBeenCalledWith('import-1', true, {}, [], { 's-1': false });
  });

  it('uses the native project-attach event for safe single-instance handoff', () => {
    let callback: ((payload: unknown) => void) | undefined;
    const eventsOn = vi.fn((_event: string, listener: (payload: unknown) => void) => {
      callback = listener;
      return () => {};
    });
    standInEvents(eventsOn);
    const update = vi.fn();

    wailsClient.subscribeProjectAttach(update);
    callback?.({ attached: false, reason: 'Busy' });

    expect(eventsOn).toHaveBeenCalledWith('system:attached', expect.any(Function));
    expect(update).toHaveBeenCalledWith({ attached: false, reason: 'Busy' });
  });

  it('reads the status report preview through its schema and passes the opt-in on', async () => {
    const preview = {
      html: '<p>x</p>',
      json: '{}\n',
      folder: 'narration-utils/production/reports',
      stem: 'production-status-20260921-100000Z',
      contractedAmountIncluded: true,
    };
    const productionStatusReportPreview = vi.fn().mockResolvedValue(JSON.stringify(preview));
    standInHost({ ProductionStatusReportPreview: productionStatusReportPreview });

    await expect(wailsClient.productionStatusReportPreview(true)).resolves.toEqual(preview);
    expect(productionStatusReportPreview).toHaveBeenCalledWith(true);

    standInHost({ ProductionStatusReportPreview: vi.fn().mockResolvedValue(JSON.stringify({ ...preview, extra: 1 })) });
    await expect(wailsClient.productionStatusReportPreview(false)).rejects.toBeInstanceOf(WireError);
  });

  it('sets the schedule basis through the plan schema and refuses an unknown one in the reply', async () => {
    const plan = { deadline: null, contractedAmount: null, payment: 'none', rateBasis: 'own', milestones: [] };
    const productionSetRateBasis = vi.fn().mockResolvedValue(JSON.stringify(plan));
    standInHost({ ProductionSetRateBasis: productionSetRateBasis });

    await expect(wailsClient.setProductionRateBasis('own')).resolves.toEqual(plan);
    expect(productionSetRateBasis).toHaveBeenCalledWith('own');

    standInHost({ ProductionSetRateBasis: vi.fn().mockResolvedValue(JSON.stringify({ ...plan, rateBasis: 'fast' })) });
    await expect(wailsClient.setProductionRateBasis('own')).rejects.toBeInstanceOf(WireError);
  });

  it('lists recent projects from the native binding', async () => {
    const recents = [{ path: 'C:/Projects/Alice', name: 'Alice', lastOpened: '2026-09-10T12:00:00Z' }];
    const projectRecents = vi.fn().mockResolvedValue(JSON.stringify(recents));
    standInHost({ ProjectRecents: projectRecents });

    await expect(wailsClient.projectRecents()).resolves.toEqual(recents);
    expect(projectRecents).toHaveBeenCalledWith();
  });

  it('opens the native folder-browse dialog for selecting a project folder', async () => {
    const selectProjectFolder = vi.fn().mockResolvedValue(JSON.stringify({ selected: true, path: 'C:/Projects/New-Project' }));
    standInHost({ ProjectSelectFolder: selectProjectFolder });

    await expect(wailsClient.selectProjectFolder()).resolves.toEqual({ selected: true, path: 'C:/Projects/New-Project' });
    expect(selectProjectFolder).toHaveBeenCalledWith();
  });

  it('switches the active project, defaulting an omitted name to an empty string for the backend to fill in', async () => {
    const switchProject = vi.fn().mockResolvedValue(JSON.stringify({ switched: true }));
    standInHost({ ProjectSwitch: switchProject });

    await expect(wailsClient.switchProject('C:/Projects/Alice')).resolves.toEqual({ switched: true });
    expect(switchProject).toHaveBeenCalledWith('C:/Projects/Alice', '');

    await wailsClient.switchProject('C:/Projects/Alice', 'Alice');
    expect(switchProject).toHaveBeenCalledWith('C:/Projects/Alice', 'Alice');
  });

  it('surfaces a refusal reason when switching project fails', async () => {
    const switchProject = vi.fn().mockResolvedValue(JSON.stringify({ switched: false, reason: 'Narration Studio is busy.' }));
    standInHost({ ProjectSwitch: switchProject });

    await expect(wailsClient.switchProject('C:/Projects/Alice')).resolves.toEqual({ switched: false, reason: 'Narration Studio is busy.' });
  });

  it('creates a new project under a parent directory and a name, through ProjectCreateIn', async () => {
    const createProject = vi.fn().mockResolvedValue(JSON.stringify({ switched: true }));
    standInHost({ ProjectCreateIn: createProject });

    await expect(wailsClient.createProject('C:/Projects', 'New Project')).resolves.toEqual({ switched: true });
    expect(createProject).toHaveBeenCalledWith('C:/Projects', 'New Project');
  });

  it('creates a new project with an empty parent, letting the backend default to the projects directory', async () => {
    const createProject = vi.fn().mockResolvedValue(JSON.stringify({ switched: true }));
    standInHost({ ProjectCreateIn: createProject });

    await expect(wailsClient.createProject('', 'New Project')).resolves.toEqual({ switched: true });
    expect(createProject).toHaveBeenCalledWith('', 'New Project');
  });

  it('removes a recent project via the native binding and resolves with the updated list', async () => {
    const remaining = [{ path: 'C:/Projects/Alice', name: 'Alice', lastOpened: '2026-09-10T12:00:00Z' }];
    const removeRecentProject = vi.fn().mockResolvedValue(JSON.stringify(remaining));
    standInHost({ ProjectRemoveRecent: removeRecentProject });

    await expect(wailsClient.removeRecentProject('C:/Projects/Voltage-and-the-Undercroft')).resolves.toEqual(remaining);
    expect(removeRecentProject).toHaveBeenCalledWith('C:/Projects/Voltage-and-the-Undercroft');
  });

  it('decodes the Tracks discover, select, and list bindings', async () => {
    const discovery = { candidates: ['C:/Projects/Alice/Alice.rpp'], selected: 'C:/Projects/Alice/Alice.rpp' };
    const project = { path: 'C:/Projects/Alice/Alice.rpp', tracks: [] };
    const select = vi.fn().mockResolvedValue(JSON.stringify(discovery));
    standInHost({
      TracksDiscover: vi.fn().mockResolvedValue(JSON.stringify(discovery)),
      TracksSelect: select,
      TracksList: vi.fn().mockResolvedValue(JSON.stringify(project)),
    });

    await expect(wailsClient.tracksDiscover()).resolves.toEqual(discovery);
    await expect(wailsClient.tracksSelect('C:/Projects/Alice/Alice.rpp')).resolves.toEqual(discovery);
    expect(select).toHaveBeenCalledWith('C:/Projects/Alice/Alice.rpp');
    await expect(wailsClient.tracksList()).resolves.toEqual(project);
  });

  it('decodes the ChapterTrackMap list, confirm, and clear bindings', async () => {
    const empty = { documentId: 'doc-1', mappings: [] };
    const confirmed = {
      trackGuid: 'track-guid-a',
      chapterId: 'c-0001',
      chapterTitle: 'Chapter One',
      confirmedAt: '2026-09-22T00:00:00Z',
      origin: 'manual' as const,
      match: null,
    };
    const withOne = { documentId: 'doc-1', mappings: [confirmed] };
    const confirm = vi.fn().mockResolvedValue(JSON.stringify(confirmed));
    const clear = vi.fn().mockResolvedValue(JSON.stringify(empty));
    standInHost({
      ChapterTrackMapList: vi.fn().mockResolvedValueOnce(JSON.stringify(empty)).mockResolvedValueOnce(JSON.stringify(withOne)),
      ChapterTrackMapConfirm: confirm,
      ChapterTrackMapClear: clear,
    });

    await expect(wailsClient.chapterTrackMapList()).resolves.toEqual(empty);
    await expect(wailsClient.chapterTrackMapConfirm('track-guid-a', 'c-0001')).resolves.toEqual(confirmed);
    expect(confirm).toHaveBeenCalledWith('track-guid-a', 'c-0001');
    await expect(wailsClient.chapterTrackMapList()).resolves.toEqual(withOne);
    await expect(wailsClient.chapterTrackMapClear('track-guid-a')).resolves.toEqual(empty);
    expect(clear).toHaveBeenCalledWith('track-guid-a');
  });

  it('sends the review query and decision to the host and decodes the findings it answers', async () => {
    const finding = {
      schema_version: 1,
      id: 'f1',
      analyzer: 'transcript-compare',
      project: { path: 'C:/P' },
      source: {},
      category: 'transcript_discrepancy',
      severity: 'warning',
      confidence: null,
      confidence_reason: 'no timing signal',
      evidence_version: 'v1',
      review: { status: 'dismissed', note: 'noise', timestamp: '2026-09-23T10:00:00Z' },
    };
    const summary = {
      total: 1,
      unreviewed: 0,
      accepted: 0,
      dismissed: 1,
      deferred: 0,
      decided: 1,
      cleared: 1,
      notInLatestRun: 0,
      analyzers: null,
      categories: null,
      chapters: null,
    };
    const list = vi.fn().mockResolvedValue(JSON.stringify({ findings: null, total: 0 }));
    const get = vi.fn().mockResolvedValue(JSON.stringify(finding));
    const review = vi.fn().mockResolvedValue(JSON.stringify(finding));
    const setType = vi.fn().mockResolvedValue(JSON.stringify({ ...finding, review: { ...finding.review, type: 'pron' } }));
    standInHost({
      FindingsList: list,
      FindingsGet: get,
      FindingsReview: review,
      FindingsSetType: setType,
      FindingsSummary: vi.fn().mockResolvedValue(JSON.stringify(summary)),
    });

    await expect(wailsClient.findingsList({ sort: 'confidence', limit: 50 })).resolves.toEqual({ findings: [], total: 0 });
    expect(list).toHaveBeenCalledWith({ sort: 'confidence', limit: 50 });
    await expect(wailsClient.findingsGet('f1')).resolves.toMatchObject({ id: 'f1', confidence: null });
    expect(get).toHaveBeenCalledWith('f1');
    await expect(wailsClient.findingsReview({ id: 'f1', evidenceVersion: 'v1', status: 'dismissed', note: 'noise' })).resolves.toMatchObject({
      review: { status: 'dismissed' },
    });
    expect(review).toHaveBeenCalledWith('f1', 'v1', 'dismissed', 'noise');
    await expect(wailsClient.findingsSetType('f1', 'v1', 'pron')).resolves.toMatchObject({ review: { type: 'pron' } });
    expect(setType).toHaveBeenCalledWith('f1', 'v1', 'pron');
    await expect(wailsClient.findingsSummary()).resolves.toMatchObject({ dismissed: 1, analyzers: [], chapters: [] });
  });

  it("sends Go to, Loop and Stop for a finding to the host and decodes REAPER's answer", async () => {
    const goTo = vi.fn().mockResolvedValue(JSON.stringify({ outcome: 'navigated', projectTime: 102.5 }));
    const loop = vi.fn().mockResolvedValue(JSON.stringify({ outcome: 'refused', reason: 'stale', message: 'Gone.' }));
    const stop = vi.fn().mockResolvedValue(JSON.stringify({ outcome: 'stopped', restored: 2, kept: 1 }));
    const status = vi.fn().mockResolvedValue(JSON.stringify({ connection: 'connected', loopingFindingId: 'f1' }));
    standInHost({ FindingsGoTo: goTo, FindingsLoop: loop, FindingsStopLoop: stop, FindingsReaperStatus: status });

    await expect(wailsClient.findingsGoTo('f1')).resolves.toEqual({ outcome: 'navigated', projectTime: 102.5 });
    expect(goTo).toHaveBeenCalledWith('f1');
    await expect(wailsClient.findingsLoop('f1')).resolves.toEqual({ outcome: 'refused', reason: 'stale', message: 'Gone.' });
    expect(loop).toHaveBeenCalledWith('f1');
    await expect(wailsClient.findingsStopLoop()).resolves.toEqual({ outcome: 'stopped', restored: 2, kept: 1 });
    await expect(wailsClient.findingsReaperStatus()).resolves.toEqual({ connection: 'connected', loopingFindingId: 'f1' });
  });

  it('sends a cut to WorkspaceSnap as ids and a time and decodes the snapped answer', async () => {
    const snap = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ chapterId: 'c1', itemGuid: '{I}', sourceTime: 1.0013, outcome: 'snapped', time: 1.00225, moved: 0.00095 }))
      .mockResolvedValueOnce(JSON.stringify({ chapterId: 'c1', itemGuid: '{I}', sourceTime: 1, outcome: 'snapped', time: 1, moved: 0, path: '/x.wav' }));
    standInHost({ WorkspaceSnap: snap });
    await expect(wailsClient.workspaceSnap('c1', '{I}', 1.0013)).resolves.toEqual({
      chapterId: 'c1',
      itemGuid: '{I}',
      sourceTime: 1.0013,
      outcome: 'snapped',
      time: 1.00225,
      moved: 0.00095,
    });
    expect(snap).toHaveBeenCalledWith('c1', '{I}', 1.0013);
    // A key the host never sends is drift, not something to pass on.
    await expect(wailsClient.workspaceSnap('c1', '{I}', 1)).rejects.toBeInstanceOf(WireError);
  });

  it('sends Add marker for a finding to the host and decodes what REAPER added', async () => {
    const addMarker = vi.fn().mockResolvedValue(JSON.stringify({ outcome: 'added', name: "MISREAD: 'a' as 'b'", sourceTime: 12.5 }));
    standInHost({ FindingsAddMarker: addMarker });
    await expect(wailsClient.findingsAddMarker('f1')).resolves.toEqual({ outcome: 'added', name: "MISREAD: 'a' as 'b'", sourceTime: 12.5 });
    expect(addMarker).toHaveBeenCalledWith('f1');
  });

  it('rejects a marker answer the host never sends', async () => {
    standInHost({ FindingsAddMarker: vi.fn().mockResolvedValue(JSON.stringify({ outcome: 'added', name: 'x' })) });
    await expect(wailsClient.findingsAddMarker('f1')).rejects.toBeInstanceOf(WireError);
  });

  it('rejects a navigation answer the host never sends', async () => {
    standInHost({ FindingsGoTo: vi.fn().mockResolvedValue(JSON.stringify({ outcome: 'refused', reason: 'busy', message: 'x' })) });
    await expect(wailsClient.findingsGoTo('f1')).rejects.toBeInstanceOf(WireError);
  });

  it('rejects a finding whose review status the host never sends', async () => {
    const bad = {
      schema_version: 1,
      id: 'f1',
      analyzer: 'a',
      project: {},
      source: {},
      category: 'c',
      severity: 'warning',
      confidence: 0.5,
      confidence_reason: 'r',
      review: { status: 'approved' },
    };
    standInHost({ FindingsGet: vi.fn().mockResolvedValue(JSON.stringify(bad)) });
    await expect(wailsClient.findingsGet('f1')).rejects.toBeInstanceOf(WireError);
  });

  it('starts, stops and reads the teleprompter through the native bindings', async () => {
    const start = vi.fn().mockResolvedValue(JSON.stringify({ status: 'started' }));
    const stop = vi.fn().mockResolvedValue('null');
    const state = vi.fn().mockResolvedValue(JSON.stringify({ phase: 'idle', script: null, position: null }));
    standInHost({ TeleprompterStart: start, TeleprompterStop: stop, TeleprompterState: state });
    const options = { chapter: 'chapter-1', device: 'Microphone (USB)', model: 'tiny' };

    await expect(wailsClient.teleprompterStart(options)).resolves.toEqual({ status: 'started' });
    expect(start).toHaveBeenCalledWith(options);
    await wailsClient.teleprompterStop();
    expect(stop).toHaveBeenCalledWith();
    await expect(wailsClient.teleprompterState()).resolves.toEqual({
      phase: 'idle',
      message: '',
      engine: null,
      chapter: null,
      paused: false,
      script: null,
      position: null,
    });
  });

  it('sends the credits kind, not a chapter, to TeleprompterStart for the credits', async () => {
    const start = vi.fn().mockResolvedValue(JSON.stringify({ status: 'started' }));
    standInHost({ TeleprompterStart: start });

    await wailsClient.teleprompterStart({ credits: 'closing', device: 'Microphone (USB)', model: 'tiny' });

    expect(start).toHaveBeenCalledWith({ credits: 'closing', device: 'Microphone (USB)', model: 'tiny' });
  });

  it('relays the teleprompter event and state subscriptions from the native runtime', () => {
    const listeners = new Map<string, (payload: unknown) => void>();
    const eventsOn = vi.fn((event: string, listener: (payload: unknown) => void) => {
      listeners.set(event, listener);
      return () => {};
    });
    standInEvents(eventsOn);
    const onEvent = vi.fn();
    const onState = vi.fn();

    wailsClient.subscribeTeleprompterEvent(onEvent);
    wailsClient.subscribeTeleprompterState(onState);
    listeners.get('teleprompter:event')?.({ type: 'position', read: 3, committed: 2, status: 'listening', jump: null, skipped: null });
    listeners.get('teleprompter:event')?.('{"type":"segment_end","segment":1}');
    listeners.get('teleprompter:state')?.({ phase: 'running', message: 'Listening…' });

    expect(onEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'position', read: 3 }));
    expect(onEvent).toHaveBeenNthCalledWith(2, { type: 'segment_end', segment: 1 });
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ phase: 'running', script: null, position: null }));
  });

  it('builds a /media playback URL with the source path percent-encoded', () => {
    expect(wailsClient.mediaUrl('C:\\My Book\\media\\take 1.wav')).toBe('/media?path=C%3A%5CMy%20Book%5Cmedia%5Ctake%201.wav');
  });
});

describe('live events (ADR 0069: dropped and counted, never thrown inside the callback)', () => {
  type Listener = (payload: unknown) => void;

  // A fresh module per test: the live-event counter is the client's own, and one test's drops must not degrade the next.
  async function subscribeTo(event: string) {
    vi.resetModules();
    const { wailsClient: client } = await import('./wailsClient');
    let listener: Listener | undefined;
    const eventsOn = vi.fn((name: string, callback: Listener) => {
      if (name === event) listener = callback;
      return () => {};
    });
    standInEvents(eventsOn);
    const report = vi.fn().mockResolvedValue('null');
    standInHost({ SystemReportDiagnostic: report });
    return { client, emit: (payload: unknown) => listener?.(payload), report };
  }

  const transcript = { phase: 'running', percent: 10, message: 'Working', logs: [], chapters: [], rows: [], diff: '', summary: '', elapsed: 1 };
  const position = { type: 'position', read: 4, committed: 3, status: 'listening', jump: null, skipped: null };

  it('passes a valid transcript state on and keeps the marker export default', async () => {
    const { client, emit } = await subscribeTo('transcript:state');
    const update = vi.fn();
    client.subscribeTranscript(update);
    emit(transcript);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ phase: 'running', markerExport: { phase: 'idle', message: '', added: 0, skipped: 0 } }));
  });

  it('drops a malformed transcript state without throwing, and writes it to the host log', async () => {
    const { client, emit, report } = await subscribeTo('transcript:state');
    const update = vi.fn();
    client.subscribeTranscript(update);
    expect(() => emit({ ...transcript, percent: 'ten' })).not.toThrow();
    expect(update).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(1);
    const [kind, message] = report.mock.calls[0] as [string, string];
    expect(kind).toBe('wire_invalid');
    expect(message).toContain('host.event transcript:state');
    expect(message).toContain('percent');
  });

  it('tells the app once that live updates are degraded after a run of dropped events', async () => {
    const { client, emit } = await subscribeTo('teleprompter:event');
    const degraded = vi.fn();
    client.subscribeLiveUpdateHealth(degraded);
    client.subscribeTeleprompterEvent(vi.fn());
    for (let i = 0; i < 8; i += 1) emit({ ...position, read: 'x' });
    expect(degraded).toHaveBeenCalledTimes(1);
  });

  it('reads a teleprompter event sent as JSON text, as the transport may', async () => {
    const { client, emit } = await subscribeTo('teleprompter:event');
    const onEvent = vi.fn();
    client.subscribeTeleprompterEvent(onEvent);
    emit(JSON.stringify(position));
    expect(onEvent).toHaveBeenCalledWith(position);
  });

  it('ignores an event type it does not know without counting it as a failure', async () => {
    const { client, emit, report } = await subscribeTo('teleprompter:event');
    const onEvent = vi.fn();
    const degraded = vi.fn();
    client.subscribeLiveUpdateHealth(degraded);
    client.subscribeTeleprompterEvent(onEvent);
    for (let i = 0; i < 10; i += 1) emit({ type: 'latency', ms: 12 });
    expect(onEvent).not.toHaveBeenCalled();
    expect(degraded).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0]?.[0]).toBe('wire_unknown_event');
    expect(report.mock.calls[0]?.[1]).toContain('latency');
  });

  it('drops a value that is not an event at all', async () => {
    const { client, emit, report } = await subscribeTo('teleprompter:event');
    const onEvent = vi.fn();
    client.subscribeTeleprompterEvent(onEvent);
    emit(42);
    emit(null);
    emit('not json');
    expect(onEvent).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalled();
  });

  it('fills a partial teleprompter state and drops one with an unknown phase', async () => {
    const { client, emit } = await subscribeTo('teleprompter:state');
    const onState = vi.fn();
    client.subscribeTeleprompterState(onState);
    emit({ phase: 'running' });
    emit({ phase: 'paused' });
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledWith({ phase: 'running', message: '', engine: null, chapter: null, paused: false, script: null, position: null });
  });

  it('drops a project-attach event with the wrong shape', async () => {
    const { client, emit } = await subscribeTo('system:attached');
    const update = vi.fn();
    client.subscribeProjectAttach(update);
    emit({ attached: 'yes' });
    emit({ attached: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ attached: true });
  });

  it('passes on a notice from the host and drops one with no text', async () => {
    const { client, emit } = await subscribeTo('system:notice');
    const onNotice = vi.fn();
    client.subscribeNotices(onNotice);
    emit({ text: 'Your settings file could not be read.' });
    emit({ message: 'wrong key' });
    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenCalledWith('Your settings file could not be read.');
  });

  it('reads the teleprompter state binding through the same schema', async () => {
    vi.resetModules();
    const { wailsClient: client } = await import('./wailsClient');
    standInHost({
      TeleprompterState: () => Promise.resolve(JSON.stringify({ phase: 'idle', message: 'Choose', engine: null, chapter: null, script: null, position: null })),
    });
    await expect(client.teleprompterState()).resolves.toMatchObject({ phase: 'idle', engine: null });
  });
});

describe('the pronunciation sources bindings', () => {
  it('calls the two host methods with their arguments and decodes each answer', async () => {
    const sources = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ sources: [{ id: 'cmu', label: 'CMU dictionary', kind: 'lookup', available: true }], default: 'cmu' }));
    const candidate = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ ok: true, say: 'krō-ˈkā' }))
      .mockResolvedValueOnce(JSON.stringify({ ok: false, reason: 'Type it in.' }));
    standInHost({ PronunciationSources: sources, PronunciationCandidate: candidate });

    await expect(wailsClient.pronunciationSources()).resolves.toMatchObject({ default: 'cmu' });
    await expect(wailsClient.pronunciationCandidate('croquet', 'merriam_webster')).resolves.toEqual({ ok: true, say: 'krō-ˈkā' });
    expect(candidate).toHaveBeenCalledWith('croquet', 'merriam_webster');
    await expect(wailsClient.pronunciationCandidate('croquet', 'manual')).resolves.toEqual({ ok: false, reason: 'Type it in.' });
  });

  it('refuses an answer its schema does not accept', async () => {
    standInHost({ PronunciationCandidate: () => Promise.resolve(JSON.stringify({ ok: true })) });
    await expect(wailsClient.pronunciationCandidate('croquet', 'cmu')).rejects.toBeInstanceOf(WireError);
  });
});

describe('the take evidence binding', () => {
  const answer = {
    chapterId: 'c-1',
    firstToken: 0,
    lastToken: 3,
    firstParagraph: 0,
    lastParagraph: 0,
    takes: [
      {
        id: 'take:a:b',
        matched: { ok: true, value: 75 },
        measure: {
          pause: { ok: true, value: 1.2 },
          rms: { ok: true, value: -16.9 },
          nf: { ok: false, reason: 'No 500 ms window of the take holds signal.' },
          clarity: { ok: false, reason: 'Not measured' },
          breaths: { ok: true, value: 0 },
        },
        via: 'aligned',
      },
    ],
  };

  it('calls WorkspaceTakeEvidence with the chapter and token range and decodes the answer', async () => {
    const evidence = vi.fn().mockResolvedValue(JSON.stringify(answer));
    standInHost({ WorkspaceTakeEvidence: evidence });
    await expect(wailsClient.workspaceTakeEvidence('c-1', 0, 3)).resolves.toEqual(answer);
    expect(evidence).toHaveBeenCalledWith('c-1', 0, 3);
  });

  it('refuses a figure that is both a value and a reason', async () => {
    const both = structuredClone(answer);
    Object.assign(both.takes[0].matched, { reason: 'x' });
    standInHost({ WorkspaceTakeEvidence: () => Promise.resolve(JSON.stringify(both)) });
    await expect(wailsClient.workspaceTakeEvidence('c-1', 0, 3)).rejects.toBeInstanceOf(WireError);
  });
});

describe('the bookmarks bindings', () => {
  const bookmark = {
    id: 'b1',
    chapterId: 'c-0001',
    paragraphId: 'p-000001',
    paragraph: 0,
    offset: 21,
    label: '',
    note: '',
    createdAt: '2026-10-11T10:00:00Z',
    stale: false,
  };

  it('calls the four host methods with their arguments and decodes each answer', async () => {
    const list = vi.fn().mockResolvedValue(JSON.stringify([bookmark]));
    const add = vi.fn().mockResolvedValue(JSON.stringify(bookmark));
    const update = vi.fn().mockResolvedValue(JSON.stringify({ ...bookmark, label: 'The Queen' }));
    const remove = vi.fn().mockResolvedValue('[]');
    standInHost({ BookmarksList: list, BookmarksAdd: add, BookmarksUpdate: update, BookmarksRemove: remove });

    await expect(wailsClient.bookmarksList()).resolves.toEqual([bookmark]);
    await expect(wailsClient.bookmarksAdd('c-0001', 'p-000001', 21)).resolves.toEqual(bookmark);
    expect(add).toHaveBeenCalledWith('c-0001', 'p-000001', 21);
    await expect(wailsClient.bookmarksUpdate('b1', 'The Queen', '')).resolves.toMatchObject({ label: 'The Queen' });
    expect(update).toHaveBeenCalledWith('b1', 'The Queen', '');
    await expect(wailsClient.bookmarksRemove('b1')).resolves.toEqual([]);
    expect(remove).toHaveBeenCalledWith('b1');
  });

  it('refuses an answer its schema does not accept', async () => {
    standInHost({ BookmarksList: () => Promise.resolve(JSON.stringify([{ ...bookmark, offset: -1 }])) });
    await expect(wailsClient.bookmarksList()).rejects.toBeInstanceOf(WireError);
  });
});

describe('the passage map bindings', () => {
  const run = [
    { pid: 'p-000001', word: 0, sec: 0, kind: 'start' as const },
    { pid: 'p-000002', word: 9, sec: 11.25, kind: 'stop' as const, prev: { pid: 'p-000002', word: 9 } },
  ];
  const marks = run.map((mark, index) => ({
    ...mark,
    id: `c-0001.1.${index}`,
    run: 'c-0001.1',
    chapterId: 'c-0001',
    itemGuid: 'Take 001',
    takeGuid: 'Take 001',
    stale: false,
  }));

  it('calls both host methods with their arguments and decodes each answer', async () => {
    const record = vi.fn().mockResolvedValue(JSON.stringify(marks));
    const list = vi.fn().mockResolvedValue(JSON.stringify(marks));
    standInHost({ PassageMapRecordRun: record, PassageMapList: list });

    await expect(wailsClient.passageMapRecordRun('c-0001', run)).resolves.toEqual(marks);
    expect(record).toHaveBeenCalledWith('c-0001', run);
    await expect(wailsClient.passageMapList('c-0001')).resolves.toEqual(marks);
    expect(list).toHaveBeenCalledWith('c-0001');
  });

  it('refuses an answer its schema does not accept', async () => {
    standInHost({ PassageMapList: () => Promise.resolve(JSON.stringify([{ ...marks[0], kind: 'pause' }])) });
    await expect(wailsClient.passageMapList('c-0001')).rejects.toBeInstanceOf(WireError);
  });
});

describe('the accepted words bindings', () => {
  const word = {
    key: 'p-000001:5',
    paragraphId: 'p-000001',
    ordinal: 5,
    text: 'Queen',
    acceptedAt: '2026-10-11T10:00:00Z',
    paragraph: 0,
    stale: false,
  };
  const words = { chapterId: 'c-0001', words: [word] };

  it('calls the three host methods with their arguments and decodes each answer', async () => {
    const list = vi.fn().mockResolvedValue(JSON.stringify(words));
    const accept = vi.fn().mockResolvedValue(JSON.stringify({ ...words, changed: ['p-000001:5'] }));
    const unaccept = vi.fn().mockResolvedValue(JSON.stringify({ chapterId: 'c-0001', words: [], changed: ['p-000001:5'] }));
    standInHost({ EditingAcceptedList: list, EditingAccept: accept, EditingUnaccept: unaccept });

    await expect(wailsClient.editingAcceptedList('c-0001')).resolves.toEqual(words);
    expect(list).toHaveBeenCalledWith('c-0001');
    await expect(wailsClient.editingAccept('c-0001', ['p-000001:5'])).resolves.toMatchObject({ changed: ['p-000001:5'] });
    expect(accept).toHaveBeenCalledWith('c-0001', ['p-000001:5']);
    await expect(wailsClient.editingUnaccept('c-0001', ['p-000001:5'])).resolves.toMatchObject({ words: [] });
    expect(unaccept).toHaveBeenCalledWith('c-0001', ['p-000001:5']);
  });

  it('refuses an answer its schema does not accept', async () => {
    standInHost({ EditingAcceptedList: () => Promise.resolve(JSON.stringify({ ...words, words: [{ ...word, ordinal: -1 }] })) });
    await expect(wailsClient.editingAcceptedList('c-0001')).rejects.toBeInstanceOf(WireError);
  });
});

// Wails v2 rejected a failed Go method with the error's text; v3 rejects with a RuntimeError carrying it (ADR 0200). Pages render a
// rejection with String(reason), so the text must arrive alone, never as "RuntimeError: ...".
describe('host errors keep the text a page shows', () => {
  it('rejects with the Go error text when a host method fails', async () => {
    standInHost({ ProjectRecents: () => Promise.reject(new Call.RuntimeError('The recent projects file could not be read.')) });

    const reason = await wailsClient.projectRecents().catch((error: unknown) => error);

    expect(reason).toBe('The recent projects file could not be read.');
    expect(String(reason)).toBe('The recent projects file could not be read.');
  });

  it('passes every other rejection through unchanged', async () => {
    const unknownMethod = new ReferenceError('unknown bound method');
    standInHost({ ProjectRecents: () => Promise.reject(unknownMethod) });
    await expect(wailsClient.projectRecents()).rejects.toBe(unknownMethod);

    standInHost({ ProjectRecents: () => Promise.reject('already text') });
    await expect(wailsClient.projectRecents()).rejects.toBe('already text');
  });
});
