// The mock host (mockApi.ts): REAPER actions.
import type {
  ManuscriptParagraph,
  ChapterTagsPreview,
  CleanupToolsState,
  LineIdentityState,
  NarrationApi,
  PickupItem,
  PickupList,
  PickupsMoment,
  PickupsState,
  ProjectStateState,
  RenderConfigState,
  RetakeLanesState,
} from '../../types';
import {
  WIRE_CHAPTERS,
  WIRE_CHAPTER_TAGS_EMBED_SUCCESS,
  WIRE_CHAPTER_TAGS_PREVIEW_IDLE,
  WIRE_CHAPTER_TAGS_PREVIEW_NOT_RENDERED,
  WIRE_CHAPTER_TAGS_PREVIEW_READY,
  WIRE_CLEANUP_TOOLS_ERROR,
  WIRE_CLEANUP_TOOLS_IDLE,
  WIRE_CLEANUP_TOOLS_LAUNCHED,
  WIRE_LINE_IDENTITY_ERROR,
  WIRE_LINE_IDENTITY_IDLE,
  WIRE_LINE_IDENTITY_READ_SUCCESS,
  WIRE_LINE_IDENTITY_STAMP_CONFLICT,
  WIRE_PICKUPS_ERROR,
  WIRE_PICKUPS_EXPORT_SUCCESS,
  WIRE_PICKUPS_IDLE,
  WIRE_PICKUPS_IMPORT_SUCCESS,
  WIRE_PICKUPS_NEXT_SUCCESS,
  WIRE_PARAGRAPHS,
  WIRE_PROJECT_STATE_CHECKED,
  WIRE_PROJECT_STATE_IDLE,
  WIRE_RENDER_CONFIG_ERROR,
  WIRE_RENDER_CONFIG_IDLE,
  WIRE_RENDER_CONFIG_NO_REGIONS,
  WIRE_RENDER_CONFIG_SUCCESS,
  WIRE_RETAKE_LANES_ERROR,
  WIRE_RETAKE_LANES_IDLE,
  WIRE_RETAKE_LANES_LIST,
  WIRE_RETAKE_LANES_NONE,
  WIRE_RETAKE_LANES_PICKED,
  wireClone,
} from '../mockFixtures';
import type { MockApiSeed } from './state';

/**
 * The REAPER actions the audio engine panel runs, each a run with its own state and live event: line identity, pickups,
 * the chapter render, the cleanup tools, the project-state check, retake lanes and chapter tags.
 */
export function createReaperActionsMock(initial: MockApiSeed, projectFolder: () => string, manuscript?: PickupManuscript) {
  let lineIdentity: LineIdentityState = wireClone(
    initial.lineIdentity === 'success'
      ? WIRE_LINE_IDENTITY_READ_SUCCESS
      : initial.lineIdentity === 'conflict'
        ? WIRE_LINE_IDENTITY_STAMP_CONFLICT
        : initial.lineIdentity === 'error'
          ? WIRE_LINE_IDENTITY_ERROR
          : WIRE_LINE_IDENTITY_IDLE,
  );
  const lineIdentitySubscribers = new Set<(state: LineIdentityState) => void>();
  const publishLineIdentity = () => lineIdentitySubscribers.forEach((fn) => fn(wireClone(lineIdentity)));
  let pickups: PickupsState = wireClone(
    initial.pickups === 'import-success'
      ? WIRE_PICKUPS_IMPORT_SUCCESS
      : initial.pickups === 'next-success'
        ? WIRE_PICKUPS_NEXT_SUCCESS
        : initial.pickups === 'export-success'
          ? WIRE_PICKUPS_EXPORT_SUCCESS
          : initial.pickups === 'error'
            ? WIRE_PICKUPS_ERROR
            : WIRE_PICKUPS_IDLE,
  );
  // The pickups a real REAPER project would still have open: seeded to match whichever WIRE_PICKUPS_* fixture
  // booted above, so Next and Resolve behave consistently with what the seed already shows as remaining.
  let pickupsOpen: PickupsMoment[] =
    initial.pickups === undefined || initial.pickups === 'error'
      ? []
      : [
          { position: 9.25, tag: 'narrator', note: 'Mispronounced "labyrinthine"' },
          { position: 42, tag: '', note: 'Dog barked in the background' },
        ];
  // The pickups resolved in this mock session (`PICKUP_DONE:` markers), which Reopen puts back and ListMarkers lists.
  let pickupsDone: PickupsMoment[] = [];
  // The 'error' seed models a broken REAPER script (the recurring cause a real ERROR event reports), not a
  // one-off: every action keeps failing the same way until the narrator fixes REAPER and reopens, the same as
  // a real session import_pickups/next_pickup/etc. would if the script itself is what's wrong.
  const pickupsAlwaysErrors = initial.pickups === 'error';
  const pickupsSubscribers = new Set<(state: PickupsState) => void>();
  const publishPickups = () => pickupsSubscribers.forEach((fn) => fn(wireClone(pickups)));
  // Mirrors the Go service's begin(): every new run starts from a clean state (no stale next/resolved/importReport/csv
  // from a previous run), except remaining/total, which survive so the count does not flash back to zero.
  const beginPickups = (phase: PickupsState['phase'], message: string) => {
    pickups = { ...wireClone(WIRE_PICKUPS_IDLE), runId: String(Date.now()), phase, message, remaining: pickups.remaining, total: pickups.total };
  };
  // A run's settled outcome is either onSuccess (the normal path) or, when pickupsAlwaysErrors, the same
  // REAPER error every time. Every action's setTimeout callback runs this instead of writing its own success
  // state directly, so the 'error' seed stays broken across every action, not just the first.
  const settlePickups = (onSuccess: () => void) => {
    if (pickupsAlwaysErrors) {
      pickups = { ...pickups, phase: 'error', message: WIRE_PICKUPS_ERROR.message };
    } else {
      onSuccess();
    }
    publishPickups();
  };
  let renderConfig: RenderConfigState = wireClone(
    initial.renderConfig === 'success'
      ? WIRE_RENDER_CONFIG_SUCCESS
      : initial.renderConfig === 'no-regions'
        ? WIRE_RENDER_CONFIG_NO_REGIONS
        : initial.renderConfig === 'error'
          ? WIRE_RENDER_CONFIG_ERROR
          : WIRE_RENDER_CONFIG_IDLE,
  );
  // The 'no-regions' seed models a project with no chapter regions yet (Configure still succeeds - it is just
  // project-info keys - but predicts 0 files); 'error' models a broken REAPER script, sticking the same way the
  // pickups 'error' seed does.
  const renderConfigHasRegions = initial.renderConfig !== 'no-regions';
  const renderConfigAlwaysErrors = initial.renderConfig === 'error';
  const renderConfigSubscribers = new Set<(state: RenderConfigState) => void>();
  const publishRenderConfig = () => renderConfigSubscribers.forEach((fn) => fn(wireClone(renderConfig)));
  let cleanupTools: CleanupToolsState = wireClone(
    initial.cleanupTools === 'launched' ? WIRE_CLEANUP_TOOLS_LAUNCHED : initial.cleanupTools === 'error' ? WIRE_CLEANUP_TOOLS_ERROR : WIRE_CLEANUP_TOOLS_IDLE,
  );
  const cleanupToolsAlwaysErrors = initial.cleanupTools === 'error';
  const cleanupToolsSubscribers = new Set<(state: CleanupToolsState) => void>();
  const publishCleanupTools = () => cleanupToolsSubscribers.forEach((fn) => fn(wireClone(cleanupTools)));
  let projectState: ProjectStateState = wireClone(WIRE_PROJECT_STATE_IDLE);
  const projectStateSubscribers = new Set<(state: ProjectStateState) => void>();
  const publishProjectState = () => projectStateSubscribers.forEach((fn) => fn(wireClone(projectState)));
  const retakeLanesList = wireClone(initial.retakeLanes === 'none' ? WIRE_RETAKE_LANES_NONE : WIRE_RETAKE_LANES_LIST);
  let retakeLanes: RetakeLanesState = wireClone(
    initial.retakeLanes === 'picked' ? WIRE_RETAKE_LANES_PICKED : initial.retakeLanes === 'error' ? WIRE_RETAKE_LANES_ERROR : WIRE_RETAKE_LANES_IDLE,
  );
  const retakeLanesAlwaysErrors = initial.retakeLanes === 'error';
  const retakeLanesSubscribers = new Set<(state: RetakeLanesState) => void>();
  const publishRetakeLanes = () => retakeLanesSubscribers.forEach((fn) => fn(wireClone(retakeLanes)));
  // Chapter tag embedding never talks to REAPER: its preview is a fixed seed, not derived from
  // renderConfig's live state, since the two are independent bindings on the real host too (ChapterTagsPreview
  // reads renderConfig.Snapshot() itself, server-side).
  const chapterTagsPreview: ChapterTagsPreview = wireClone(
    initial.chapterTags === 'ready'
      ? WIRE_CHAPTER_TAGS_PREVIEW_READY
      : initial.chapterTags === 'not-rendered'
        ? WIRE_CHAPTER_TAGS_PREVIEW_NOT_RENDERED
        : WIRE_CHAPTER_TAGS_PREVIEW_IDLE,
  );
  const chapterTagsEmbedAlwaysErrors = initial.chapterTagsEmbedAlwaysErrors === true;
  const bindings = {
    lineIdentityStamp: async (rows, overwrite) => {
      if (rows.length === 0) throw new Error('select at least one item to stamp');
      lineIdentity = {
        ...wireClone(WIRE_LINE_IDENTITY_IDLE),
        runId: String(Date.now()),
        phase: 'stamping',
        message: 'Stamping manuscript line identity in REAPER…',
      };
      publishLineIdentity();
      setTimeout(() => {
        if (lineIdentity.phase !== 'stamping') return;
        const applied = rows.length;
        lineIdentity = {
          ...lineIdentity,
          phase: 'success',
          message: `Stamped ${applied} line${applied === 1 ? '' : 's'}.`,
          stamp: { applied, unchanged: 0, missingCount: 0, conflictsCount: 0, missing: [], conflicts: [] },
        };
        publishLineIdentity();
      }, 300);
      void overwrite; // the mock never simulates a real conflict from a second stamp; WIRE_LINE_IDENTITY_STAMP_CONFLICT covers that state directly (initial.lineIdentity)
      return { status: 'started' };
    },
    lineIdentityRead: async () => {
      lineIdentity = {
        ...wireClone(WIRE_LINE_IDENTITY_IDLE),
        runId: String(Date.now()),
        phase: 'reading',
        message: 'Reading manuscript line identity from REAPER…',
      };
      publishLineIdentity();
      setTimeout(() => {
        if (lineIdentity.phase !== 'reading') return;
        lineIdentity = { ...wireClone(WIRE_LINE_IDENTITY_READ_SUCCESS), runId: lineIdentity.runId };
        publishLineIdentity();
      }, 300);
      return { status: 'started' };
    },
    lineIdentityState: async () => wireClone(lineIdentity),
    subscribeLineIdentity: (onUpdate) => {
      lineIdentitySubscribers.add(onUpdate);
      onUpdate(wireClone(lineIdentity));
      return () => lineIdentitySubscribers.delete(onUpdate);
    },
    pickupsImport: async (csvText) => {
      const lines = csvText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const dataLines = lines.length > 0 && lines[0].toLowerCase().startsWith('start') ? lines.slice(1) : lines;
      const rowErrors: string[] = [];
      const added: PickupsMoment[] = [];
      dataLines.forEach((line, index) => {
        const [startRaw, note, tag] = line.split(',');
        const position = Number(startRaw);
        if (!Number.isFinite(position) || position < 0 || !note) {
          rowErrors.push(`line ${index + 1}: could not parse this row`);
          return;
        }
        added.push({ position, note: note.trim(), tag: (tag ?? '').trim() });
      });
      if (added.length === 0) throw new Error(`no valid pickups were found in the file${rowErrors[0] ? `: ${rowErrors[0]}` : ''}`);
      pickupsOpen = [...pickupsOpen, ...added];
      beginPickups('importing', 'Importing pickups into REAPER…');
      publishPickups();
      setTimeout(() => {
        if (pickups.phase !== 'importing') return;
        settlePickups(() => {
          pickups = {
            ...pickups,
            phase: 'success',
            message: `Imported ${added.length} pickup${added.length === 1 ? '' : 's'}.`,
            importReport: { added: added.length, existing: 0, invalid: 0 },
            remaining: pickupsOpen.length,
            total: pickupsOpen.length + pickupsDone.length,
          };
        });
      }, 300);
      return { status: 'started', rowErrors };
    },
    pickupsExport: async () => {
      beginPickups('exporting', 'Exporting pickups from REAPER…');
      publishPickups();
      setTimeout(() => {
        if (pickups.phase !== 'exporting') return;
        settlePickups(() => {
          const rows = pickupsOpen.map((row) => `${row.position.toFixed(6)},${row.note},${row.tag}`);
          const csv = ['start,note,tag', ...rows].join('\n') + (rows.length > 0 ? '\n' : '');
          pickups = {
            ...pickups,
            phase: 'success',
            message: `Exported ${pickupsOpen.length} pickup${pickupsOpen.length === 1 ? '' : 's'}.`,
            csv,
            remaining: pickupsOpen.length,
            total: pickupsOpen.length + pickupsDone.length,
          };
        });
      }, 300);
      return { status: 'started' };
    },
    pickupsNext: async () => {
      beginPickups('jumping', 'Jumping to the next pickup…');
      publishPickups();
      setTimeout(() => {
        if (pickups.phase !== 'jumping') return;
        settlePickups(() => {
          if (pickupsOpen.length === 0) {
            pickups = { ...pickups, phase: 'error', message: 'No pickups remain.' };
          } else {
            pickups = { ...pickups, phase: 'success', message: 'Jumped to the next pickup.', next: pickupsOpen[0] };
          }
        });
      }, 300);
      return { status: 'started' };
    },
    pickupsResolve: async (position) => {
      beginPickups('resolving', 'Resolving this pickup…');
      publishPickups();
      setTimeout(() => {
        if (pickups.phase !== 'resolving') return;
        settlePickups(() => {
          const index = pickupsOpen.findIndex((row) => Math.abs(row.position - position) <= 0.15);
          if (index < 0) {
            pickups = { ...pickups, phase: 'error', message: 'No open pickup was found at that position.' };
          } else {
            const resolved = pickupsOpen[index];
            pickupsOpen = pickupsOpen.filter((_, candidateIndex) => candidateIndex !== index);
            pickupsDone = [...pickupsDone, resolved];
            pickups = {
              ...pickups,
              phase: 'success',
              message: 'Marked this pickup done.',
              resolved,
              remaining: pickupsOpen.length,
              total: pickupsOpen.length + pickupsDone.length,
            };
          }
        });
      }, 300);
      return { status: 'started' };
    },
    pickupsReopen: async (position) => {
      if (!Number.isFinite(position) || position < 0) throw new Error('the pickup position must be a number of seconds, zero or more');
      beginPickups('reopening', 'Reopening this pickup…');
      publishPickups();
      setTimeout(() => {
        if (pickups.phase !== 'reopening') return;
        settlePickups(() => {
          const index = pickupsDone.findIndex((row) => Math.abs(row.position - position) <= 0.15);
          if (index < 0) {
            pickups = { ...pickups, phase: 'error', message: 'No resolved pickup was found at that position.' };
            return;
          }
          pickupsOpen = [...pickupsOpen, pickupsDone[index]].sort((a, b) => a.position - b.position);
          pickupsDone = pickupsDone.filter((_, candidateIndex) => candidateIndex !== index);
          pickups = { ...pickups, phase: 'success', message: 'Marked this pickup open again.' };
        });
      }, 300);
      return { status: 'started' };
    },
    pickupsListMarkers: async () => {
      beginPickups('listing', 'Reading the pickup markers from REAPER…');
      publishPickups();
      setTimeout(() => {
        if (pickups.phase !== 'listing') return;
        settlePickups(() => {
          const markers = [
            ...pickupsOpen.map((row) => ({ start: row.position, state: 'open' as const, tag: row.tag, note: row.note })),
            ...pickupsDone.map((row) => ({ start: row.position, state: 'done' as const, tag: row.tag, note: row.note })),
          ].sort((a, b) => a.start - b.start);
          const done = pickupsDone.length;
          pickups = {
            ...pickups,
            phase: 'success',
            message: `Read ${markers.length} pickup marker${markers.length === 1 ? '' : 's'}: ${markers.length - done} open, ${done} done.`,
            markers,
          };
        });
      }, 300);
      return { status: 'started' };
    },
    pickupsCount: async () => {
      beginPickups('counting', 'Counting pickups…');
      publishPickups();
      setTimeout(() => {
        if (pickups.phase !== 'counting') return;
        settlePickups(() => {
          const remaining = pickupsOpen.length;
          const total = remaining + pickupsDone.length;
          pickups = { ...pickups, phase: 'success', message: `${remaining} pickup${remaining === 1 ? '' : 's'} remaining of ${total}.`, remaining, total };
        });
      }, 300);
      return { status: 'started' };
    },
    pickupsState: async () => wireClone(pickups),
    // "Punch from here" on a pickup: the position is already known, so this
    // just moves the mock cursor there minus the repo default pre-roll (Teleprompter.punch_preroll_seconds).
    subscribePickups: (onUpdate) => {
      pickupsSubscribers.add(onUpdate);
      onUpdate(wireClone(pickups));
      return () => pickupsSubscribers.delete(onUpdate);
    },
    renderConfigConfigure: async (outputFolder) => {
      const folder = outputFolder.trim();
      if (!folder) throw new Error('an output folder is required');
      renderConfig = { ...wireClone(WIRE_RENDER_CONFIG_IDLE), runId: String(Date.now()), phase: 'configuring', message: 'Configuring the chapter render…' };
      publishRenderConfig();
      setTimeout(() => {
        if (renderConfig.phase !== 'configuring') return;
        if (renderConfigAlwaysErrors) {
          renderConfig = { ...renderConfig, phase: 'error', message: WIRE_RENDER_CONFIG_ERROR.message };
        } else if (renderConfigHasRegions) {
          const targets = [`${folder}\\Chapter 1.wav`, `${folder}\\Chapter 2.wav`];
          renderConfig = {
            ...renderConfig,
            phase: 'success',
            folder,
            targets,
            count: targets.length,
            message: `Render configured for ${targets.length} chapter files. Press Render in REAPER to create them.`,
          };
        } else {
          renderConfig = {
            ...renderConfig,
            phase: 'success',
            folder,
            targets: [],
            count: 0,
            message: 'Render configured. No chapter regions were found yet: create them before rendering.',
          };
        }
        publishRenderConfig();
      }, 300);
      return { status: 'started' };
    },
    renderConfigSuggestFolder: async () => ({ folder: `${projectFolder()}\\renders` }),
    renderConfigState: async () => wireClone(renderConfig),
    subscribeRenderConfig: (onUpdate) => {
      renderConfigSubscribers.add(onUpdate);
      onUpdate(wireClone(renderConfig));
      return () => renderConfigSubscribers.delete(onUpdate);
    },
    cleanupToolsLaunch: async (tool) => {
      const labels: Record<string, string> = { repair_pops_clicks: 'Repair Pops/Clicks', magnolius_declick: 'Magnolius DeClick' };
      const label = labels[tool];
      if (!label) throw new Error(`unknown cleanup tool "${tool}"`);
      cleanupTools = { ...wireClone(WIRE_CLEANUP_TOOLS_IDLE), runId: String(Date.now()), phase: 'launching', tool, message: `Opening ${label} in REAPER…` };
      publishCleanupTools();
      setTimeout(() => {
        if (cleanupTools.phase !== 'launching') return;
        cleanupTools = cleanupToolsAlwaysErrors
          ? { ...cleanupTools, phase: 'error', message: WIRE_CLEANUP_TOOLS_ERROR.message }
          : {
              ...cleanupTools,
              phase: 'launched',
              action: tool === 'repair_pops_clicks' ? WIRE_CLEANUP_TOOLS_LAUNCHED.action : 'Script: Magnolius_DeClick.lua',
              message: `${label} is open in REAPER. Nothing has changed yet: the repair happens only when you apply it there.`,
            };
        publishCleanupTools();
      }, 300);
      return { status: 'started' };
    },
    cleanupToolsState: async () => wireClone(cleanupTools),
    subscribeCleanupTools: (onUpdate) => {
      cleanupToolsSubscribers.add(onUpdate);
      onUpdate(wireClone(cleanupTools));
      return () => cleanupToolsSubscribers.delete(onUpdate);
    },
    projectStateCheck: async () => {
      if (initial.projectState === 'error') throw new Error('the REAPER bridge is unavailable');
      projectState = { ...wireClone(WIRE_PROJECT_STATE_IDLE), runId: String(Date.now()), phase: 'checking', message: "Checking REAPER's project state…" };
      publishProjectState();
      setTimeout(() => {
        if (projectState.phase !== 'checking') return;
        const changeCount = initial.projectState === 'unchanged' ? 41 : (WIRE_PROJECT_STATE_CHECKED.changeCount ?? 42);
        projectState = { ...wireClone(WIRE_PROJECT_STATE_CHECKED), runId: projectState.runId, changeCount };
        publishProjectState();
      }, 150);
      return { status: 'started' as const };
    },
    projectStateChangedSince: async (current, baseline) => ({ changed: current !== baseline }),
    projectStateState: async () => wireClone(projectState),
    subscribeProjectState: (onUpdate) => {
      projectStateSubscribers.add(onUpdate);
      onUpdate(wireClone(projectState));
      return () => projectStateSubscribers.delete(onUpdate);
    },
    retakeLanesList: async () => wireClone(retakeLanesList),
    retakeLanesPick: async (lineId, itemGuid) => {
      const line = retakeLanesList.lines.find((candidate) => candidate.lineId === lineId);
      const retake = line?.retakes.find((candidate) => candidate.itemGuid === itemGuid);
      if (!line || !retake)
        throw new Error('that retake is not on a fixed-lane track in the saved project; save the project in REAPER and open the list again');
      retakeLanes = {
        ...wireClone(WIRE_RETAKE_LANES_IDLE),
        runId: String(Date.now()),
        phase: 'picking',
        lineId,
        itemGuid,
        trackName: line.trackName,
        message: `Asking REAPER to play this retake on ${line.trackName}…`,
      };
      publishRetakeLanes();
      setTimeout(() => {
        if (retakeLanes.phase !== 'picking') return;
        retakeLanes = retakeLanesAlwaysErrors
          ? { ...retakeLanes, phase: 'error', message: WIRE_RETAKE_LANES_ERROR.message }
          : {
              ...retakeLanes,
              phase: 'picked',
              lane: retake.lane,
              message: `Lane ${retake.lane + 1} is now the only lane playing on ${line.trackName}. To go back, use Undo in REAPER: it restores what played before.`,
            };
        publishRetakeLanes();
      }, 300);
      return { status: 'started' };
    },
    retakeLanesState: async () => wireClone(retakeLanes),
    subscribeRetakeLanes: (onUpdate) => {
      retakeLanesSubscribers.add(onUpdate);
      onUpdate(wireClone(retakeLanes));
      return () => retakeLanesSubscribers.delete(onUpdate);
    },
    chapterTagsPreview: async () => wireClone(chapterTagsPreview),
    chapterTagsEmbed: async (destPath) => {
      if (!destPath.trim()) throw new Error('choose the MP3 file to add chapters to');
      if (chapterTagsEmbedAlwaysErrors) throw new Error('could not write chapter tags to the new copy');
      return wireClone(WIRE_CHAPTER_TAGS_EMBED_SUCCESS);
    },
    ...createPickupListMock(manuscript, initial.pickupList),
  } satisfies Partial<NarrationApi>;
  return { bindings };
}

/** The manuscript the pickups are placed on: the mock's live one, once it has loaded (the browser loads the whole book). */
type PickupManuscript = { ready: Promise<unknown>; paragraphs: () => ManuscriptParagraph[] };

/** The first sentence of a paragraph, whole. A paragraph with no sentence end gives itself. */
function firstSentence(text: string): string {
  return /^.*?[.!?]['"’”]?(?=\s|$)/s.exec(text.trim())?.[0] ?? text.trim();
}

/** The clause a sentence ends on, after its last comma, colon or dash, led by an ellipsis, as the mock's "…all dripping wet, cross, and uncomfortable."; the whole sentence when it is short or has none. */
function tailClause(text: string): string {
  const sentence = firstSentence(text);
  if (sentence.length <= 80) return sentence;
  const cut = [...sentence.matchAll(/(?:[,:;]\s+|\s*(?:--|—)\s*)/g)].map((m) => m.index + m[0].length).filter((at) => sentence.length - at >= 20);
  const at = cut.length ? cut[cut.length - 1] : -1;
  return at < 0 ? sentence : `…${sentence.slice(at)}`;
}

/**
 * The sample pickups of the Studio Next mock's fixtures (`PICKUPS` in its alice.ts), placed on chapter 3's own lines of the manuscript
 * given, so the Booth finds each one's paragraph as it does the host's. The seed's lines stand in when that chapter has none.
 */
function samplePickups(paragraphs: readonly ManuscriptParagraph[]): PickupItem[] {
  const own = paragraphs.filter((paragraph) => paragraph.chapterId === 'chapter-3');
  const lines = own.length > 0 ? own : WIRE_PARAGRAPHS.filter((paragraph) => paragraph.chapterId === 'chapter-3');
  const at = (index: number) => lines[Math.min(index, lines.length - 1)];
  const sample = (
    index: number,
    item: Omit<PickupItem, 'chapterId' | 'paragraphId' | 'paragraph' | 'context' | 'included' | 'done' | 'waiting'>,
  ): PickupItem => ({
    ...item,
    chapterId: 'chapter-3',
    paragraphId: at(index).id,
    paragraph: at(index).index,
    context: at(index).text,
    included: true,
    done: false,
    waiting: false,
  });
  return [
    sample(0, {
      id: `speech:chapter-3:misread:${at(0).id}:0`,
      time: 131,
      at: 131,
      type: 'misread',
      gap: 'misread',
      script: firstSentence(at(0).text),
      source: 'speech',
      confidence: 0.97,
      confReason: '',
    }),
    sample(1, {
      id: `speech:chapter-3:missing:${at(1).id}:0`,
      time: 348.2,
      at: 348.2,
      type: 'missing',
      gap: 'missing',
      script: tailClause(at(1).text),
      source: 'speech',
      confidence: 0.93,
      confReason: '',
    }),
    sample(3, {
      id: 'finding:sample-noise',
      time: 450.9,
      at: 450.9,
      type: 'noise',
      script: tailClause(at(3).text),
      source: 'audio',
      confidence: null,
      confReason: 'not_scored',
      findingId: 'sample-noise',
    }),
  ];
}

const PICKUP_ID = /^(speech|finding|you):[A-Za-z0-9:._-]{1,240}$/;
const PICKUP_LINE_MAX = 500;

/** The host's pickup list (`bindings_pickuplist.go`, ADR 0840) with the same refusals: ids only, one plain line of text, a known
 * chapter, a time zero or more. With no DAW in the mock, a done state is kept, as the host keeps it while the DAW is away. */
function createPickupListMock(
  manuscript?: PickupManuscript,
  unreadable?: MockApiSeed['pickupList'],
): Pick<NarrationApi, 'pickupsList' | 'pickupsAdd' | 'pickupsRemove' | 'pickupsSetIncluded' | 'pickupsSetDone'> {
  const lines = () => manuscript?.paragraphs() ?? WIRE_PARAGRAPHS;
  let items = samplePickups(WIRE_PARAGRAPHS);
  // Every call waits for the manuscript, so the list is placed on its lines before anything reads or changes it.
  const placed = (manuscript?.ready ?? Promise.resolve()).then(() => {
    items = samplePickups(lines());
  });
  const removed = new Set<string>();
  const list = (): PickupList => ({
    pickups: wireClone(items.filter((item) => !removed.has(item.id))),
    leftOut: WIRE_CHAPTERS.filter((chapter) => chapter.id !== 'chapter-3').map((chapter) => ({
      chapterId: chapter.id,
      state: 'never',
      reasons: ['not_checked'],
    })),
  });
  const known = (id: string, removedOk = false) => {
    if (!PICKUP_ID.test(id) || (!items.some((item) => item.id === id) && !(removedOk && removed.has(id))) || (!removedOk && removed.has(id))) {
      throw new Error('that pickup is not in the list');
    }
  };
  const update = (id: string, change: Partial<PickupItem>) => {
    items = items.map((item) => (item.id === id ? { ...item, ...change } : item));
  };
  return {
    pickupsList: async () => {
      await placed;
      if (unreadable) throw new Error('the project folder could not be read');
      return list();
    },
    pickupsAdd: async (chapterId, time, line) => {
      await placed;
      const text = line.trim();
      if (!text) throw new Error('type the line first');
      if ([...text].length > PICKUP_LINE_MAX) throw new Error(`a line can be at most ${PICKUP_LINE_MAX} characters`);
      if (/\p{Cc}/u.test(text)) throw new Error('the line must be one line of plain text');
      if (!WIRE_CHAPTERS.some((chapter) => chapter.id === chapterId)) throw new Error('that chapter is not in the manuscript');
      if (!Number.isFinite(time) || time < 0) throw new Error("the time is outside the chapter's recording");
      const id = `you:${chapterId}-${[...`${chapterId}:${text.toLowerCase()}`].reduce((hash, char) => (hash * 31 + char.codePointAt(0)!) >>> 0, 7).toString(16)}`;
      removed.delete(id);
      if (!items.some((item) => item.id === id)) {
        const needle = [...text.toLowerCase()].slice(0, 24).join('');
        const paragraph = lines().find((row) => row.chapterId === chapterId && row.text.trim().toLowerCase().startsWith(needle));
        items = [
          ...items,
          {
            id,
            chapterId,
            paragraphId: paragraph?.id ?? null,
            paragraph: paragraph?.index ?? null,
            time,
            at: null,
            type: 'misread',
            script: text,
            context: paragraph?.text ?? text,
            source: 'you',
            confidence: null,
            confReason: 'added_by_hand',
            included: true,
            done: false,
            waiting: false,
          },
        ];
      }
      return list();
    },
    pickupsRemove: async (id) => {
      await placed;
      known(id, true);
      removed.add(id);
      update(id, { included: true, done: false, waiting: false });
      return list();
    },
    pickupsSetIncluded: async (id, included) => {
      await placed;
      known(id);
      update(id, { included });
      return list();
    },
    pickupsSetDone: async (id, done) => {
      await placed;
      known(id);
      const item = items.find((row) => row.id === id);
      update(id, { done, waiting: item?.at !== null });
      return list();
    },
  };
}
