// Shared by the page's tests and stories: the Booth page over the mock api, the mock DAW client of one of the mock's setups, the
// command router, the shell's journal (its leave guard), the overlay host and the shell's context menu, at an address.
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { CommandRouter } from '../../../input/router';
import { OverlayProvider } from '../../../overlay/OverlayProvider';
import type { OverlayService } from '../../../overlay/overlayService';
import { createMockDawClient, type DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { createJournal, type Journal } from '../../../studio/journal/createJournal';
import { StudioProvider } from '../../../studio/StudioProvider';
import type { GuideEntity, ManuscriptChapter, ManuscriptParagraph, NarrationApi, TeleprompterLocateResult } from '../../../types';
import { ContextMenuHost } from '../../layout/ContextMenuHost';

const CHAPTERS: ManuscriptChapter[] = [
  { id: 'c1', title: 'Chapter One', index: 0, wordCount: 30, status: 'not_started', contentKind: 'narration' } as ManuscriptChapter,
  { id: 'c2', title: 'Chapter Two', index: 1, wordCount: 6, status: 'not_started', contentKind: 'narration' } as ManuscriptChapter,
];

const paragraph = (id: string, chapterId: string, index: number, text: string): ManuscriptParagraph => ({
  id,
  chapterId,
  chapter: chapterId === 'c1' ? 'Chapter One' : 'Chapter Two',
  index,
  text,
  entityIds: [],
});

const PARAGRAPHS: Record<string, ManuscriptParagraph[]> = {
  c1: [
    paragraph('p1', 'c1', 0, 'The Garden was quiet. Nobody had come down since the morning.'),
    paragraph('p2', 'c1', 1, '“Off with her head,” said the Queen. “Not yet. The King is late.”'),
    paragraph('p3', 'c1', 2, 'She turned and walked away. The roses watched her go.'),
  ],
  c2: [paragraph('q1', 'c2', 0, 'A new day began in the court.')],
};

const entity = (id: string, canonical_name: string, category: string, extra: Partial<GuideEntity> = {}): GuideEntity => ({
  id,
  canonical_name,
  aliases: [],
  category,
  occurrences: [],
  occurrence_count: 1,
  pronunciation: { ipa: '', source: 'cmu', confidence: 'high' },
  description: { text: '', evidence: {} },
  personality_notes: [],
  relationships: [],
  properties: [],
  locked: false,
  review_state: 'reviewed',
  ...extra,
});

const ENTITIES: GuideEntity[] = [
  entity('e-queen', 'Queen', 'Character', {
    personality_notes: [{ text: 'Clipped and loud.', evidence: {} }],
    pronunciation: { ipa: 'kwiːn', source: 'cmu', confidence: 'high' },
  }),
  entity('e-garden', 'Garden', 'Place', { description: { text: 'The walled rose garden.', evidence: {} } }),
];

/** A locate that places the end of the recording in the second paragraph, read from the saved project. */
export const LOCATED: TeleprompterLocateResult = {
  status: 'found',
  match: {},
  track: null,
  recordedEnd: { projectTime: 12, itemGuid: 'i', takeGuid: 't', sourceFile: '', sourceStart: 0, sourceTime: 12, sourceAvailable: true, supported: true },
  tail: null,
  located: null,
  lastReading: null,
  verdict: { kind: 'daw_only', start: null, daw: { word: 14, number: 15, sentence: null, confident: true, source: 'saved' }, prompter: null, tokens: 34 },
} as unknown as TeleprompterLocateResult;

/** The api the page reads: the two chapters, the Story Bible, no session running, and no resume point unless `locate` is given. */
export function pageApi(overrides: Partial<NarrationApi> = {}): NarrationApi {
  return createMockApi({
    manuscriptChapters: async () => CHAPTERS,
    manuscriptParagraphs: async (chapterId: string) => PARAGRAPHS[chapterId] ?? [],
    teleprompterState: async () => ({ phase: 'idle', message: '', engine: null, chapter: null, script: null, position: null }),
    teleprompterLocate: () => Promise.reject(new Error('no recording')),
    teleprompterDevices: async () => ({ devices: [{ name: 'USB Mic' }], error: null }),
    guideEntities: async () => ENTITIES,
    guideDialogueCues: async () => [],
    creditsTemplates: async () => [],
    readAloudReaperState: async () => ({ status: 'ready', message: '', playing: false, recording: false }),
    ...overrides,
  } as Partial<NarrationApi>);
}

export const dawFor = (setup: DawSetupId): DawClient =>
  createMockDawClient(DAW_SETUPS[setup], { chapterIds: ['c1', 'c2', 'credits-opening'], candidateIds: [], findingIds: [] });

export const newJournal = (): Journal => createJournal({ dawName: () => 'the DAW', dawLastAction: async () => 'unknown' });

/** The page's surroundings in the app shell, at `/booth<search>`. */
export function BoothHost({
  api,
  daw,
  journal,
  overlay,
  search = '?chapter=c1',
  children,
}: {
  api: NarrationApi;
  daw: DawClient;
  journal: Journal;
  overlay: OverlayService;
  search?: string;
  children: ReactNode;
}) {
  return (
    <MemoryRouter initialEntries={[`/booth${search}`]}>
      <ApiProvider api={api}>
        <PortOverrides clients={{ daw }}>
          <CommandRouter>
            <StudioProvider journal={journal}>
              <OverlayProvider service={overlay}>
                <main className="h-full">
                  <ContextMenuHost className="size-full">{children}</ContextMenuHost>
                </main>
              </OverlayProvider>
            </StudioProvider>
          </CommandRouter>
        </PortOverrides>
      </ApiProvider>
    </MemoryRouter>
  );
}
