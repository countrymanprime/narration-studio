// Shared by the page's tests and stories: the Editing page over the mock api with a small chapter that was heard, the mock DAW client of one
// of the mock's setups, the command router, the shell's journal, the overlay host and the shell's context menu.
import type { ReactNode } from 'react';
import { ApiProvider } from '../../../api/ApiContext';
import type { Finding } from '../../../api/contracts/findings';
import type { WorkspaceAlignmentResult, WorkspaceTakesResult } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { CommandRouter } from '../../../input/router';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import { createMockDawClient, type DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { createJournal, type Journal } from '../../../studio/journal/createJournal';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { ManuscriptChapter, NarrationApi } from '../../../types';
import { ContextMenuHost } from '../../layout/ContextMenuHost';

const chapter = (id: string, title: string, index: number): ManuscriptChapter =>
  ({ id, title, index, wordCount: 10, status: 'not_started', contentKind: 'narration' }) as ManuscriptChapter;

const CHAPTERS: ManuscriptChapter[] = [chapter('c1', 'Chapter One', 0), chapter('c2', 'Chapter Two', 1)];

const ITEM_GUID = '{ITEM-1}';
const TRACK_GUID = '{TRACK-1}';

/** Chapter One: two lines, read once through on one item; "quiet" was heard as "quite" and an "um" was said after "Garden". */
const PARAS = [
  { id: 'p1', text: 'The Garden was quiet today.' },
  { id: 'p2', text: 'She turned and walked away.' },
];

function alignmentOf(chapterId: string, heard: boolean): WorkspaceAlignmentResult {
  const base = { chapterId, reasons: [], needsAlignAgain: false, extras: [], items: [] };
  if (chapterId !== 'c1') return { ...base, state: 'current', paragraphs: [], tokens: [], engine: { id: 'whisper:small', name: 'Whisper small' } };
  if (!heard) return { ...base, state: 'never', paragraphs: PARAS, tokens: [] };
  let i = 0;
  let at = 1;
  const tokens = PARAS.flatMap((p) =>
    p.text.split(' ').map((text, w) => {
      const start = at;
      at += 0.4;
      const misread = p.id === 'p1' && w === 3;
      return {
        i: i++,
        p: p.id,
        w,
        text,
        status: misread ? ('misread' as const) : ('read' as const),
        ...(misread ? { heard: 'quite' } : {}),
        item: 0,
        start,
        end: start + 0.35,
        conf: 0.95,
      };
    }),
  );
  return {
    ...base,
    state: 'current',
    paragraphs: PARAS,
    tokens,
    extras: [
      {
        text: 'um',
        tokens: 1,
        start: { itemIndex: 0, itemGuid: ITEM_GUID, sourceTime: 1.75 },
        end: { itemIndex: 0, itemGuid: ITEM_GUID, sourceTime: 1.79 },
        afterToken: 1,
        words: [{ text: 'um', item: 0, start: 1.75, end: 1.79, conf: 0.9, added: true, timing: 'spread' }],
      },
    ],
    items: [{ index: 0, itemGuid: ITEM_GUID, live: true, sourceStart: 0, playRate: 1, position: 0, length: 12 }],
    engine: { id: 'whisper:small', name: 'Whisper small' },
  };
}

const take = (id: string, label: string, active: boolean) => ({
  id,
  source: 'reaper',
  action: 'activate',
  confirm: false,
  label,
  detail: '',
  active,
  itemGuid: ITEM_GUID,
  takeGuid: `{${id}}`,
  sourceFile: 'C:/media/c1.wav',
  sourceStart: 1,
  sourceLength: 2.4,
  usable: true,
  compared: false,
});

/** The first line has two takes; the second has none. */
function takesOf(chapterId: string, firstToken: number, lastToken: number): WorkspaceTakesResult {
  const first = chapterId === 'c1' && firstToken === 0;
  return {
    chapterId,
    firstToken,
    lastToken,
    firstParagraph: 0,
    lastParagraph: 0,
    words: lastToken - firstToken + 1,
    passageId: first ? 'ps-1' : '',
    itemGuid: first ? ITEM_GUID : '',
    candidates: first ? ([take('t1', 'T-1', true), take('t2', 'T-2', false)] as WorkspaceTakesResult['candidates']) : [],
  };
}

const PROJECT = {
  path: 'C:/p.rpp',
  tracks: [
    {
      guid: TRACK_GUID,
      index: 0,
      name: 'Chapter One',
      color: '',
      muted: false,
      soloed: false,
      items: [
        {
          guid: ITEM_GUID,
          position: 0,
          length: 12,
          name: 'c1.wav',
          sourceKind: 'WAVE',
          sourceFile: 'C:/media/c1.wav',
          sourceAvailable: true,
          supported: true,
          takeGuid: '{t1}',
          sourceStart: 0,
          playRate: 1,
        },
      ],
    },
  ],
};

/** The finding the "open at a finding" link names: the misread "quiet". */
export const FINDING: Finding = {
  id: 'f-quiet',
  manuscript: { chapter_id: 'c1', span: { paragraph_id: 'p1', ordinal: 3 } },
} as unknown as Finding;

/** The api the page reads. `heard: false` answers Chapter One with nothing transcribed. */
export function pageApi({ heard = true, ...overrides }: Partial<NarrationApi> & { heard?: boolean } = {}): NarrationApi {
  return createMockApi({
    manuscriptChapters: async () => CHAPTERS,
    workspaceAlignment: async (chapterId: string) => alignmentOf(chapterId, heard),
    workspaceTakes: async (chapterId: string, firstToken: number, lastToken: number) => takesOf(chapterId, firstToken, lastToken),
    chapterTrackMapList: async () => ({ documentId: 'd', mappings: [{ chapterId: 'c1', trackGuid: TRACK_GUID }] }),
    tracksList: async () => PROJECT,
    findingsGet: async (id: string) => (id === FINDING.id ? FINDING : Promise.reject(new Error('no such finding'))),
    ...overrides,
  } as Partial<NarrationApi>);
}

/**
 * What the host answers for a chapter with no audio to edit: no track linked (`unlinked`), a link to a track the saved project no longer has
 * (`missing`), or a linked track with nothing on it (`empty`). In each the alignment's item is not live, as the host's is without a track.
 */
export function noAudioApi(kind: 'unlinked' | 'missing' | 'empty'): Partial<NarrationApi> {
  return {
    workspaceAlignment: async (chapterId: string) => ({ ...alignmentOf(chapterId, true), items: [] }),
    chapterTrackMapList: async () => ({
      documentId: 'd',
      mappings:
        kind === 'unlinked'
          ? []
          : [{ chapterId: 'c1', trackGuid: kind === 'missing' ? '{GONE}' : TRACK_GUID, chapterTitle: 'Chapter One', confirmedAt: '2026-09-01T12:00:00Z' }],
    }),
    ...(kind === 'empty' ? { tracksList: async () => ({ ...PROJECT, tracks: PROJECT.tracks.map((t) => ({ ...t, items: [] })) }) } : {}),
  };
}

export const dawFor = (setup: DawSetupId): DawClient =>
  createMockDawClient(DAW_SETUPS[setup], { chapterIds: ['c1', 'c2'], candidateIds: ['t1', 't2'], findingIds: [] });

export const newJournal = (): Journal => createJournal({ dawName: () => 'the DAW', dawLastAction: async () => 'unknown' });

/** The page's surroundings in the app shell. */
export function EditingHost({ api, daw, journal, children }: { api: NarrationApi; daw: DawClient; journal: Journal; children: ReactNode }) {
  return (
    <ApiProvider api={api}>
      <PortOverrides clients={{ daw }}>
        <CommandRouter>
          <StudioProvider journal={journal}>
            <OverlayProvider>
              <main className="h-full">
                <ContextMenuHost className="size-full">{children}</ContextMenuHost>
              </main>
            </OverlayProvider>
          </StudioProvider>
        </CommandRouter>
      </PortOverrides>
    </ApiProvider>
  );
}
