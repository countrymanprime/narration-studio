// The mock host (mockApi.ts): tracks, chapter links and chapter sync.
import type { ChapterFolderMove, ChapterFolders } from '../contracts/chapterTrackMap';
import type { Track, TracksProject } from '../contracts/tracks';
import type { VoiceTracksLayout } from '../contracts/voiceTracks';
import type {
  ChapterSyncBackground,
  ChapterSyncBatch,
  ChapterSyncChapter,
  ChapterSyncConsent,
  ChapterSyncState,
  ChapterSyncTrigger,
  NarrationApi,
  TrackMapping,
  ManuscriptChapter,
} from '../../types';
import { WIRE_CHAPTERS, WIRE_TRACKS_PROJECT, WIRE_VOICE_FOLDER_GUID, mockTracksProject, wireClone } from '../mockFixtures';
import { mockChapterRegionPlan, mockChapterSyncPreview, mockChapterTrackLinks, mockChapterTrackMatch } from '../chapterTrackMatchMock';
import type { CoverageResult } from '../contracts/coverage';
import { type MockApiSeed, mockDocumentId, type MockState } from './state';

// The two credits ids docs/architecture/manuscript-teleprompter.md, src/studio/desktop/internal/coverage/credits.go give a real title outside the manuscript's own chapter list.
const CREDITS_CHECK_TITLE: Record<string, string | undefined> = { 'credits-opening': 'Opening credits', 'credits-closing': 'Closing credits' };

/** The chapter-track bindings: the DAW project's tracks, the chapter links, chapter sync and chapter regions. */
export function createChapterTracksMock(
  s: MockState,
  initial: MockApiSeed,
  {
    manuscriptReady,
    dawFileLinked,
    peekCoverage,
    chaptersWithCredits,
    voiceLayout,
  }: {
    manuscriptReady: Promise<void>;
    /** The project's layout (voice-tracks.json) as ChapterTrackCreate reads it at the press: a folder with a Narrator child, or one track. */
    voiceLayout: () => Promise<VoiceTracksLayout>;
    dawFileLinked: () => boolean;
    peekCoverage: (chapterId: string) => CoverageResult;
    /** The chapter list as the host sends it: the credits around the manuscript's chapters. */
    chaptersWithCredits: () => ManuscriptChapter[];
  },
) {
  // Chapter sync (src/studio/desktop/chaptersync.go): the consent, the pairs the narrator undid, and who listens.
  const project = mockTracksProject(initial);
  // The tracks ChapterTrackCreate added in REAPER this session: in REAPER's live list at once, in the saved project only after a save.
  const added: Track[] = [];
  // `?mockReaperState=no_link` stages a chapter with no link: as the Booth's read does (mockApi's `linked`), only a link the narrator made
  // this session counts, not one seeded or written by chapter sync on its own.
  const startedAt = Date.now();
  const linkCounts = (link: TrackMapping) => initial.reaperState !== 'no_link' || (link.origin === 'manual' && Date.parse(link.confirmedAt) >= startedAt);
  const liveProject = (): TracksProject => ({ ...project, tracks: [...project.tracks, ...added] });
  // A Voice folders project links Chapter 1 to its folder, in place of the default seed's link to its first track.
  if (initial.voiceFolders) {
    s.chapterTrackMappings = [
      ...s.chapterTrackMappings.filter((link) => link.chapterId !== WIRE_CHAPTERS[0].id),
      {
        trackGuid: WIRE_VOICE_FOLDER_GUID,
        chapterId: WIRE_CHAPTERS[0].id,
        chapterTitle: WIRE_CHAPTERS[0].title,
        confirmedAt: '2026-11-02T09:00:00Z',
        origin: 'manual',
        match: null,
      },
    ];
  }
  // `?mockNestedChapters=1`: the first three chapters linked to the project's first three tracks, which REAPER nests (nestedPlan below).
  if (initial.nestedChapters && s.chapterTrackMappings.length === 0) {
    s.chapterTrackMappings = WIRE_CHAPTERS.slice(0, 3).map((chapter, index) => ({
      trackGuid: project.tracks[index].guid,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      confirmedAt: '2026-11-03T09:00:00Z',
      origin: 'manual' as const,
      match: null,
    }));
  }
  // The nested shape `?mockNestedChapters=1` seeds, until a repair: the first linked chapter is the folder, the next two sit inside it.
  const nestedPlan = (): ChapterFolders => {
    const links = s.chapterTrackMappings;
    if (!initial.nestedChapters || s.chaptersUnnested || links.length < 3) return { outcome: 'clean', moves: [], expected: [] };
    const [folder, ...inside] = links.slice(0, 3);
    const moves: ChapterFolderMove[] = inside.map((link) => ({
      trackGuid: link.trackGuid,
      trackName: link.chapterTitle,
      chapterId: link.chapterId,
      fromGuid: folder.trackGuid,
      fromName: folder.chapterTitle,
      toGuid: '',
      toName: '',
    }));
    return { outcome: 'nested', moves, expected: moves.map((move) => move.trackGuid) };
  };
  let chapterSyncConsent: ChapterSyncConsent = initial.chapterSync === 'ask' ? 'undecided' : initial.chapterSync === 'off' ? 'off' : 'on';
  let chapterSyncDecidedAt: string | null = chapterSyncConsent === 'undecided' ? null : '2026-09-24T09:00:00Z';
  let chapterSyncLastSync: string | null =
    initial.chapterSync === 'activity'
      ? '2026-09-24T10:42:00Z'
      : chapterSyncConsent === 'on' && initial.chapterSync !== 'linked'
        ? '2026-09-24T09:00:00Z'
        : null;
  const chapterSyncRejected = new Set<string>();
  // Background recording checks (src/studio/desktop/coverage_background.go): the `backgroundChecks` seed, then what the narrator saves.
  const background: ChapterSyncBackground = {
    enabled: true,
    wait:
      initial.backgroundChecks === 'confirm'
        ? 'confirm'
        : initial.chapterSync === 'background' || initial.backgroundChecks === 'waiting'
          ? 'recording'
          : initial.backgroundChecks === 'running'
            ? ''
            : 'nothing',
    queued: initial.backgroundChecks === 'confirm' || initial.backgroundChecks === 'waiting' ? 2 : initial.backgroundChecks === 'running' ? 1 : 0,
    firstPassModel: 'tiny',
    recheckModel: 'small',
  };
  const mockBackground = (): ChapterSyncBackground => ({ ...background });
  const chapterSyncUnsavedEdits = initial.chapterSync === 'unsaved';
  // The Sync activity list, newest first (the host keeps 20): the unsaved seed shows one row from a save in REAPER.
  let chapterSyncActivity: ChapterSyncBatch[] =
    initial.chapterSync === 'unsaved'
      ? [{ at: '2026-09-24T09:05:00Z', trigger: 'watch', linked: [], newTracks: [{ guid: '{mock-room-tone}', name: 'Room tone', index: 9, marker: '' }] }]
      : initial.chapterSync === 'activity'
        ? mockSyncActivity()
        : [];
  // The activity seed's links: Chapter 1 by sync (its Undo shows), Chapter 2 by the narrator ("…automatically, 1 by you").
  if (initial.chapterSync === 'activity') {
    const [first, second] = project.tracks;
    s.chapterTrackMappings = [
      {
        trackGuid: first.guid,
        chapterId: WIRE_CHAPTERS[0].id,
        chapterTitle: WIRE_CHAPTERS[0].title,
        confirmedAt: '2026-09-24T10:42:00Z',
        origin: 'auto',
        match: { score: 1, kind: 'exact' },
      },
      {
        trackGuid: second.guid,
        chapterId: WIRE_CHAPTERS[1].id,
        chapterTitle: WIRE_CHAPTERS[1].title,
        confirmedAt: '2026-09-23T08:00:00Z',
        origin: 'manual',
        match: null,
      },
    ];
  }
  const chapterSyncSubscribers = new Set<(state: ChapterSyncState) => void>();
  const mockLinksRead = () => {
    const state = s.tracksDiscovery.candidates.length === 0 ? 'none' : s.tracksDiscovery.selected ? 'ready' : 'choose';
    return mockChapterTrackLinks(s.chapters, project, s.chapterTrackMappings, state);
  };
  const mockChapterSyncState = (batch: ChapterSyncBatch | null): ChapterSyncState => {
    const links = mockLinksRead();
    const plan = mockChapterSyncPreview(links, chapterSyncRejected);
    const manuscript = !initial.noManuscript && s.chapters.length > 0;
    return {
      consent: chapterSyncConsent,
      decidedAt: chapterSyncDecidedAt,
      ask: chapterSyncConsent === 'undecided' && manuscript && dawFileLinked(),
      manuscript,
      dawLinked: dawFileLinked(),
      project: links.project,
      message: links.message,
      projectFile: links.projectFile,
      savedAt: links.savedAt,
      lastSync: chapterSyncLastSync,
      counts: {
        linked: plan.kept.length + plan.autoLink.length,
        needsYou: plan.needsYou.length,
        noTrack: plan.noTrack.length,
        unmatched: plan.unmatched.length,
        pickupTracks: plan.pickupTracks.length,
      },
      batch,
      unsavedEdits: chapterSyncUnsavedEdits,
      activity: chapterSyncActivity,
      chapters: links.project === 'ready' ? mockChapterSyncRows(links) : [],
      // The `background` seed shows the engine panel's wait
      // line for the reason this stream landed: REAPER is running and its heartbeat says it is recording.
      background: mockBackground(),
    };
  };
  // The status rows, as the host builds them: the link, and the recording check's own answer (the coverage mock's).
  const mockChapterSyncRows = (links: ReturnType<typeof mockLinksRead>): ChapterSyncChapter[] =>
    links.chapters.map((chapter, index) => {
      const link = chapter.links.length === 1 ? chapter.links[0] : undefined;
      const track = link ? links.tracks.find((summary) => summary.guid === link.trackGuid) : undefined;
      const result = peekCoverage(chapter.chapterId);
      const checkedAt = result.state === 'never' ? null : (result.record?.completedAt ?? null);
      const newestSourceAt = track ? '2026-09-21T10:00:00Z' : null;
      // The pickups seed gives the first chapter a pickup track (recognised by its name, never a link) changed since its scan.
      const pickups = initial.chapterSync === 'pickups' && index === 0;
      return {
        chapterId: chapter.chapterId,
        chapterTitle: chapter.chapterTitle,
        trackGuid: link?.trackGuid ?? '',
        trackName: track?.name ?? '',
        origin: link ? (link.origin ?? 'manual') : '',
        freshness: result.state,
        reasons: result.reasons,
        checkedAt,
        checking: false,
        trackChangedAt: null,
        newestSourceAt,
        lastChanged: newestSourceAt,
        pickupTrackGuid: pickups ? '{mock-pickups-track}' : '',
        pickupTrackName: pickups ? `${chapter.chapterTitle} (pickups)` : '',
      };
    });
  const publishChapterSync = (state: ChapterSyncState) => chapterSyncSubscribers.forEach((fn) => fn(wireClone(state)));
  // A RecordingCoverage save the host's background loop reads at once: on or off, the notice answered, the model pair.
  const backgroundSettingsSaved = (tool: string, values: Record<string, string | null>) => {
    if (tool !== 'RecordingCoverage' || !Object.keys(values).some((key) => key.startsWith('background_'))) return;
    if ('background_checks' in values) background.enabled = values.background_checks !== 'false';
    if (values.background_checks_confirmed === 'true' && background.wait === 'confirm') background.wait = 'quiet';
    if ('background_first_pass_model' in values) background.firstPassModel = values.background_first_pass_model ?? 'tiny';
    if ('background_recheck_model' in values) {
      const model = values.background_recheck_model ?? 'small';
      background.recheckModel = model === 'none' ? '' : model;
    }
    if (!background.enabled) background.wait = 'off';
    else if (background.wait === 'off') background.wait = background.queued > 0 ? 'quiet' : 'nothing';
    void manuscriptReady.then(() => publishChapterSync(mockChapterSyncState(null)));
  };
  // One sync, as the host's runChapterSync does it: the confident links written as auto, the batch when anything was linked.
  const runMockChapterSync = (trigger: ChapterSyncTrigger): ChapterSyncState => {
    const plan = mockChapterSyncPreview(mockLinksRead(), chapterSyncRejected);
    const at = new Date().toISOString();
    const linked: TrackMapping[] = plan.autoLink.map((link) => ({
      trackGuid: link.trackGuid,
      chapterId: link.chapterId,
      chapterTitle: link.chapterTitle,
      confirmedAt: at,
      origin: 'auto',
      match: link.match,
    }));
    s.chapterTrackMappings = [...s.chapterTrackMappings, ...linked];
    chapterSyncLastSync = at;
    const batch: ChapterSyncBatch | null = linked.length > 0 ? { at, trigger, linked, newTracks: [] } : null;
    if (batch) chapterSyncActivity = [batch, ...chapterSyncActivity].slice(0, 20);
    const state = mockChapterSyncState(batch);
    publishChapterSync(state);
    return state;
  };
  const bindings = {
    tracksDiscover: async () => wireClone(s.tracksDiscovery),
    tracksSelect: async (path) => {
      s.tracksDiscovery = { ...s.tracksDiscovery, selected: path };
      return wireClone(s.tracksDiscovery);
    },
    tracksList: async () => wireClone(project),
    // TracksLive (src/studio/desktop/tracks_live.go): REAPER's tracks now by default; `?mockLiveTracks=saved` is REAPER not answering, so the
    // saved project with its reason, and `failing` answers the first read and refuses every later one (a read that has gone quiet).
    tracksLive: async () => {
      s.liveTrackReads += 1;
      if (initial.liveTracks === 'failing' && s.liveTrackReads > 1) throw new Error('REAPER did not answer in time.');
      const readAt = new Date().toISOString();
      if (initial.liveTracks === 'saved') {
        return wireClone({
          source: 'saved' as const,
          reason: 'not_running' as const,
          message: 'REAPER is not answering, so these are the tracks as of the last save.',
          readAt,
          project,
        });
      }
      return wireClone({ source: 'live' as const, reason: '' as const, message: '', readAt, project: liveProject() });
    },
    chapterTrackMapList: async () => ({ documentId: mockDocumentId, mappings: wireClone(s.chapterTrackMappings) }),
    chapterTrackSet: async (chapterId, trackGuid) => {
      await manuscriptReady;
      const chapter = s.chapters.find((candidate) => candidate.id === chapterId);
      // The host's chapterTitle takes the credits ids too (mapping.go), so Set must as well.
      const title = chapter?.title ?? CREDITS_CHECK_TITLE[chapterId];
      if (!title) throw new Error('that chapter is not part of the current manuscript');
      if (!trackGuid) throw new Error('choose a track before linking a chapter');
      const displaced = s.chapterTrackMappings.find((existing) => existing.trackGuid === trackGuid && existing.chapterId !== chapterId) ?? null;
      const link: TrackMapping = { trackGuid, chapterId, chapterTitle: title, confirmedAt: new Date().toISOString(), origin: 'manual', match: null };
      s.chapterTrackMappings = [...s.chapterTrackMappings.filter((existing) => existing.trackGuid !== trackGuid && existing.chapterId !== chapterId), link];
      return wireClone({ documentId: mockDocumentId, link, displaced, mappings: s.chapterTrackMappings });
    },
    // ChapterTrackCreate (src/studio/desktop/chaptertrackcreate.go): `?mockReaperState=` decides what the DAW answers, as it does for Select in
    // REAPER. The new track (a folder with a Narrator child in a Voice folders project) joins REAPER's live list (TracksLive) at once; the saved
    // project the matcher reads has it only after a save, so it is not added there.
    chapterTrackCreate: async (chapterId) => {
      await manuscriptReady;
      const chapter = s.chapters.find((candidate) => candidate.id === chapterId);
      const title = chapter?.title ?? CREDITS_CHECK_TITLE[chapterId];
      if (!title) throw new Error('that chapter is not part of the current manuscript');
      // The host names the track after the chapter's display title, its subtitle joined on (displayTitle in Go).
      const trackName = chapter?.subtitle ? `${title}: ${chapter.subtitle}` : title;
      const folders = (await voiceLayout()) === 'folders';
      // The host's guards, in its order (chaptertrackcreate.go): a chapter already linked to a track REAPER has, then a name a track has.
      const present = liveProject().tracks;
      const linked = s.chapterTrackMappings
        .filter((existing) => existing.chapterId === chapterId && linkCounts(existing))
        .map((existing) => present.find((candidate) => candidate.guid === existing.trackGuid))
        .find((candidate) => candidate !== undefined);
      if (linked)
        return {
          outcome: 'refused' as const,
          reason: 'already_linked' as const,
          message: `This chapter is already linked to “${linked.name}” in REAPER. Change or clear that link instead of adding another track.`,
        };
      const taken = present.find((candidate) => candidate.name.trim().toLowerCase() === trackName.trim().toLowerCase());
      if (taken)
        return {
          outcome: 'refused' as const,
          reason: 'name_taken' as const,
          message: `REAPER already has a ${taken.isFolder ? 'folder' : 'track'} named “${taken.name.trim()}”. Link that one with the picker instead of adding another.`,
        };
      const refusal = mockCreateRefusal(initial.reaperState);
      if (refusal) return refusal;
      const next = () => {
        s.createdTracks += 1;
        return {
          guid: `{c0ffee00-0000-4000-8000-${String(s.createdTracks).padStart(12, '0')}}`,
          index: project.tracks.length + added.length,
        };
      };
      const made = next();
      const track = { ...made, name: trackName };
      const base = { color: '', muted: false, soloed: false, items: [] };
      added.push({ ...base, ...track, depth: 0, isFolder: folders });
      let voice: { guid: string; name: string; index: number } | undefined;
      if (folders) {
        voice = { ...next(), name: 'Narrator' };
        added.push({ ...base, ...voice, depth: 1, isFolder: false });
      }
      const link: TrackMapping = {
        trackGuid: track.guid,
        chapterId,
        chapterTitle: title,
        confirmedAt: new Date().toISOString(),
        origin: 'manual',
        match: null,
      };
      s.chapterTrackMappings = [...s.chapterTrackMappings.filter((existing) => existing.chapterId !== chapterId), link];
      return wireClone({
        outcome: 'created' as const,
        documentId: mockDocumentId,
        link,
        displaced: null,
        mappings: s.chapterTrackMappings,
        track,
        ...(voice ? { voice } : {}),
      });
    },
    // ChapterFoldersCheck / ChapterFoldersRepair (src/studio/desktop/chapterfolders.go): with `?mockNestedChapters=1` the second and third
    // linked chapters' tracks sit inside the first linked chapter's folder until a repair the narrator confirmed moves them out.
    chapterFoldersCheck: async () => {
      await manuscriptReady;
      const refusal = mockCreateRefusal(initial.reaperState);
      if (refusal?.outcome === 'refused') return { outcome: 'refused' as const, reason: refusal.reason, message: refusal.message, moves: [], expected: [] };
      return wireClone(nestedPlan());
    },
    chapterFoldersRepair: async (expected) => {
      await manuscriptReady;
      const refusal = mockCreateRefusal(initial.reaperState);
      if (refusal?.outcome === 'refused') return { outcome: 'refused' as const, reason: refusal.reason, message: refusal.message, moves: [], expected: [] };
      const plan = nestedPlan();
      if (expected.join(',') !== plan.expected.join(',')) {
        return {
          outcome: 'stale' as const,
          message: 'The tracks in REAPER changed since they were checked, so nothing was moved. Check again.',
          moves: [],
          expected: [],
        };
      }
      s.chaptersUnnested = true;
      return wireClone({ ...plan, outcome: 'repaired' as const });
    },
    chapterTrackUnlink: async (chapterId) => {
      await manuscriptReady;
      if (!s.chapters.some((candidate) => candidate.id === chapterId) && !CREDITS_CHECK_TITLE[chapterId])
        throw new Error('that chapter is not part of the current manuscript');
      s.chapterTrackMappings = s.chapterTrackMappings.filter((existing) => existing.chapterId !== chapterId);
      return { documentId: mockDocumentId, mappings: wireClone(s.chapterTrackMappings) };
    },
    chapterTrackLinks: async () => {
      await manuscriptReady;
      const state = s.tracksDiscovery.candidates.length === 0 ? 'none' : s.tracksDiscovery.selected ? 'ready' : 'choose';
      // Unlike chapter sync and the region plan (which come from the picked tracks), the links list holds the credits, as the host's does.
      return wireClone(mockChapterTrackLinks(chaptersWithCredits(), project, s.chapterTrackMappings, state));
    },
    chapterSyncState: async () => {
      await manuscriptReady;
      return wireClone(mockChapterSyncState(null));
    },
    chapterSyncPreview: async () => {
      await manuscriptReady;
      return wireClone(mockChapterSyncPreview(mockLinksRead(), chapterSyncRejected));
    },
    chapterSyncSetEnabled: async (on) => {
      await manuscriptReady;
      chapterSyncConsent = on ? 'on' : 'off';
      chapterSyncDecidedAt = new Date().toISOString();
      if (on) return wireClone(runMockChapterSync('consent'));
      const state = mockChapterSyncState(null);
      publishChapterSync(state);
      return wireClone(state);
    },
    chapterSyncUndo: async (trackGuid) => {
      await manuscriptReady;
      const link = s.chapterTrackMappings.find((mapping) => mapping.trackGuid === trackGuid);
      if (!link) throw new Error('that track has no link to undo');
      if (link.origin !== 'auto') throw new Error('only an automatic link can be undone; unlink this track instead');
      s.chapterTrackMappings = s.chapterTrackMappings.filter((mapping) => mapping !== link);
      chapterSyncRejected.add(`${link.trackGuid}\u0000${link.chapterTitle}`);
      const state = mockChapterSyncState(null);
      publishChapterSync(state);
      return wireClone(state);
    },
    subscribeChapterSync: (onUpdate) => {
      chapterSyncSubscribers.add(onUpdate);
      if (initial.chapterSync === 'linked' && chapterSyncLastSync === null) {
        // App.tsx subscribes immediately on mount, well before bootstrap resolves and Home's AudiobookEstimatePanel
        // gets its own turn to subscribe; running this straight off manuscriptReady fires (and broadcasts) the
        // batch before that second subscriber exists, so its toast never shows. A short delay past the mock's own
        // settling lets every mount-time subscriber that will ever exist register first.
        void manuscriptReady.then(() => {
          setTimeout(() => {
            if (chapterSyncSubscribers.has(onUpdate) && chapterSyncLastSync === null) runMockChapterSync('daw-link');
          }, 250);
        });
      }
      return () => chapterSyncSubscribers.delete(onUpdate);
    },
    chapterRegionsPreview: async (openingTrackGuid, closingTrackGuid) => {
      await manuscriptReady;
      const state = s.tracksDiscovery.candidates.length === 0 ? 'none' : s.tracksDiscovery.selected ? 'ready' : 'choose';
      const links = mockChapterTrackLinks(s.chapters, project, s.chapterTrackMappings, state);
      return wireClone(mockChapterRegionPlan(links, openingTrackGuid, closingTrackGuid));
    },
    chapterRegionsCreate: async (openingTrackGuid, closingTrackGuid, update) => {
      await manuscriptReady;
      if (initial.regionsCreateAlwaysErrors) throw new Error('REAPER refused to write the regions: the app’s script is not responding');
      const state = s.tracksDiscovery.candidates.length === 0 ? 'none' : s.tracksDiscovery.selected ? 'ready' : 'choose';
      const plan = mockChapterRegionPlan(mockChapterTrackLinks(s.chapters, project, s.chapterTrackMappings, state), openingTrackGuid, closingTrackGuid);
      if (plan.project !== 'ready') throw new Error(plan.message);
      if (plan.rows.length === 0) throw new Error('no chapter or credits entry has a linked track with recorded items, so there are no regions to create');
      const created = plan.rows.filter((row) => row.state === 'new' || (!update && row.state !== 'exists')).length;
      const updated = update ? plan.rows.filter((row) => row.state === 'moves').length : 0;
      const ambiguous = update ? plan.rows.filter((row) => row.state === 'ambiguous').length : 0;
      const existing = plan.rows.filter((row) => row.state === 'exists').length;
      return { sent: plan.rows.length, created, existing, invalid: 0, updated, ambiguous, failed: 0 };
    },
    // "Select in REAPER" follows the same `?mockReaperState=` seed
    // readAloudRecordStart already uses for "REAPER is not there", so the two REAPER-connection concepts stay consistent in mock mode without a second seed dimension.
    trackSelectInReaper: async (trackGuid) => {
      await manuscriptReady;
      if (!trackGuid) throw new Error('choose a track before selecting it in REAPER');
      if (initial.reaperState === 'unavailable') {
        return {
          outcome: 'refused',
          reason: 'standalone',
          message: 'REAPER is not connected to this app. To select a track in REAPER, open REAPER; the app connects to it by itself.',
        };
      }
      // REAPER answers track_missing for a track that is not in its project, as the host does.
      if (!liveProject().tracks.some((track) => track.guid === trackGuid)) {
        return { outcome: 'refused', reason: 'track_missing', message: 'That track is no longer in the REAPER project.' };
      }
      return { outcome: 'selected', trackGuid };
    },
    chapterTrackMatch: async (chapterId) => {
      await manuscriptReady;
      return wireClone(mockChapterTrackMatch(chapterId, chaptersWithCredits(), project, s.chapterTrackMappings));
    },
  } satisfies Partial<NarrationApi>;
  return { bindings, publishChapterSync, mockChapterSyncState, backgroundSettingsSaved };
}

/** The activity seed's Sync activity, newest first: a link a save in REAPER made, a new track that is not a chapter, the first sync. */
function mockSyncActivity(): ChapterSyncBatch[] {
  const [first] = WIRE_TRACKS_PROJECT.tracks;
  const chapter = WIRE_CHAPTERS[0];
  return [
    {
      at: '2026-09-24T10:42:00Z',
      trigger: 'watch',
      linked: [
        {
          trackGuid: first.guid,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          confirmedAt: '2026-09-24T10:42:00Z',
          origin: 'auto',
          match: { score: 1, kind: 'exact' },
        },
      ],
      newTracks: [],
    },
    { at: '2026-09-23T17:10:00Z', trigger: 'watch', linked: [], newTracks: [{ guid: '{mock-room-tone}', name: 'Room tone', index: 9, marker: '' }] },
    {
      at: '2026-09-22T09:00:00Z',
      trigger: 'consent',
      linked: [
        {
          trackGuid: '{mock-earlier-link}',
          chapterId: WIRE_CHAPTERS[2].id,
          chapterTitle: WIRE_CHAPTERS[2].title,
          confirmedAt: '2026-09-22T09:00:00Z',
          origin: 'auto',
          match: { score: 1, kind: 'exact' },
        },
      ],
      newTracks: [],
    },
  ];
}

/** ChapterTrackCreate's refusals for the `?mockReaperState=` seeds that stop it, in the host's words; null when the DAW adds the track. */
// Only the connection refusals a seed can stage, so the chapter-folder check can answer them too (its reasons are a subset of a create's).
function mockCreateRefusal(seed: MockApiSeed['reaperState']): { outcome: 'refused'; reason: 'standalone' | 'recording'; message: string } | null {
  if (seed === 'unavailable')
    return {
      outcome: 'refused',
      reason: 'standalone',
      message: 'REAPER is not connected to this app, so no track can be added. Start REAPER, then try again.',
    };
  if (seed === 'recording_elsewhere') return { outcome: 'refused', reason: 'recording', message: 'REAPER is recording. Stop the take, then create the track.' };
  return null;
}
