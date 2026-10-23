import { usePageCommands, type PageItem } from '../../input/pageCommands';
import type { PickupItem } from '../../api/contracts/pickups';
import { ALL_SCOPE, clock, lineText, sessionPickups, type ChapterRef } from './list/pickupRows';

type Gate = { available: boolean; message?: string };

/** What the jump menu lists while Pickups is showing: the open lines, the chapter filter and the page's own actions, all from what the page holds. */
export function usePickupsPageCommands(page: {
  pickups: readonly PickupItem[];
  chapters: readonly ChapterRef[];
  scope: string;
  /** The lines of the chapter showing: what the pickup session takes. */
  inView: readonly PickupItem[];
  /** The chapters whose recording check is not current: what Check recordings opens with. */
  chaptersToCheck: readonly string[];
  daw: Gate;
  markers: Gate;
  dawName: string;
  onScope: (scope: string) => void;
  /** Selects a line in the list. */
  onReveal: (id: string) => void;
  onCheck: (chapterIds: string[]) => void;
  onOpenInBooth: (pickups: PickupItem[]) => void;
  onAddMarkers: (pickups: PickupItem[]) => Promise<unknown>;
  onError: (error: unknown) => void;
}): void {
  usePageCommands({ id: 'pickups', label: 'Pickups' }, () => {
    const items: PageItem[] = [];
    const nameOf = (id: string) => page.chapters.find((chapter) => chapter.id === id)?.name;
    for (const pickup of page.pickups.filter((p) => !p.done)) {
      items.push({
        id: `pickup.${pickup.id}`,
        label: `${clock(pickup.time)} · ${lineText(pickup)}`,
        group: 'Pickups',
        hint: nameOf(pickup.chapterId),
        icon: 'locate',
        run: () => {
          page.onScope(pickup.chapterId);
          page.onReveal(pickup.id);
        },
      });
    }

    items.push({
      id: 'scope.all',
      label: 'Show every chapter',
      group: 'Chapter',
      icon: 'goToChapter',
      disabledReason: page.scope === ALL_SCOPE ? 'Every chapter is already showing.' : undefined,
      run: () => page.onScope(ALL_SCOPE),
    });
    for (const chapter of page.chapters) {
      items.push({
        id: `scope.${chapter.id}`,
        label: `Show only ${chapter.name}`,
        group: 'Chapter',
        icon: 'goToChapter',
        disabledReason: page.scope === chapter.id ? 'Already showing this chapter.' : undefined,
        run: () => page.onScope(chapter.id),
      });
    }

    const session = sessionPickups(page.inView);
    const none = session.length === 0 ? 'No lines in the session.' : undefined;
    items.push(
      {
        id: 'check',
        label: 'Check recordings',
        group: 'Actions',
        icon: 'checkRecordings',
        disabledReason: page.daw.available ? undefined : page.daw.message || 'The DAW is not answering.',
        run: () => page.onCheck([...page.chaptersToCheck]),
      },
      {
        id: 'session.booth',
        label: `Open ${session.length} in Booth`,
        group: 'Actions',
        icon: 'record',
        disabledReason: none,
        run: () => page.onOpenInBooth(session),
      },
      {
        id: 'session.markers',
        label: `Add ${session.length} as markers in ${page.dawName}`,
        group: 'Actions',
        icon: 'addMarker',
        disabledReason: page.markers.available ? none : page.markers.message || `${page.dawName} cannot add markers now.`,
        run: () => void page.onAddMarkers(session).catch(page.onError),
      },
    );
    return items;
  });
}
