import { gestureKeys } from '../../../input/hints';
import type { CommandId } from '../../../input/commands.catalog';
import type { Keymap } from '../../../input/keymap';
import { usePageCommands, type PageItem } from '../../../input/pageCommands';

const WHILE_RECORDING = 'Not while recording. Stop the take first.';

export interface BoothCommands {
  /** The picker's rows: the chapters, and the opening and closing credits when there are any. */
  chapters: ReadonlyArray<{ id: string; name: string }>;
  /** The picker's row in view. */
  current: string;
  /** Choosing a row of `chapters`; the page refuses it itself during a take. */
  choose: (id: string) => void;
  recording: boolean;
  /** The chapter has text the reading can move through. */
  hasText: boolean;
  toggleTake: () => Promise<void>;
  punchAndRoll: () => void;
  movePhrase: (direction: 1 | -1) => void;
  exit: () => void;
  /** A pickup session the address opened: its lines, and the step between them. */
  pickups: { active: boolean; lines: number; step: (direction: 1 | -1) => void };
  keymap: Keymap;
  /** The rows for the search showing (next, previous, clear); none when no search shows. */
  search?: () => PageItem[];
  /** Cold read (#2251 item 13): on or off, and why it cannot start now. Absent, no entry. */
  coldRead?: { on: boolean; toggle: () => void; disabledReason?: string };
}

/**
 * What the Booth offers the jump menu under "On this page": its chapters (choosing one stays in the Booth, so the global "Go to <chapter>" rows,
 * which open the Script, give way), the transport, and a pickup session's steps. Read each time the menu opens, so the take and the DAW's answer
 * are the ones it opens on; an action that cannot run now stays listed, off, with the sentence the Booth's own controls give.
 */
export function useBoothPageCommands(page: BoothCommands): void {
  usePageCommands({ id: 'booth', label: 'Booth', supersedes: ['Chapters'] }, () => {
    const { chapters, current, choose, recording, hasText, toggleTake, punchAndRoll, movePhrase, exit, pickups, keymap, search, coldRead } = page;
    const keyOf = (id: CommandId): string | undefined => {
      const first = keymap[id]?.[0];
      return first ? gestureKeys(first).join('+') : undefined;
    };
    const noText = hasText ? undefined : 'There is nothing to read here yet.';
    const items: PageItem[] = [...(search?.() ?? [])];
    items.push(
      ...chapters.map((chapter): PageItem => ({
        id: `chapter.${chapter.id}`,
        label: chapter.name,
        group: 'Chapters',
        hint: chapter.id === current ? 'Open now' : undefined,
        icon: 'goToChapter',
        disabledReason: recording ? WHILE_RECORDING : undefined,
        run: () => choose(chapter.id),
      })),
    );
    items.push(
      {
        id: 'transport.record',
        label: recording ? 'Stop recording' : 'Record',
        group: 'Transport',
        hint: keyOf('reading.toggle'),
        icon: recording ? 'stop' : 'record',
        // Never off: a press that cannot start a take opens the dialog that fixes it (BoothNextPage's onRecordBlocked).
        run: () => void toggleTake(),
      },
      {
        id: 'transport.roll',
        label: 'Punch and roll from here',
        group: 'Transport',
        hint: keyOf('booth.roll'),
        icon: 'retry',
        disabledReason: recording ? undefined : 'Start recording first, then roll again from here.',
        run: punchAndRoll,
      },
      {
        id: 'transport.next',
        label: 'Next phrase',
        group: 'Transport',
        hint: keyOf('booth.phrase.next'),
        icon: 'next',
        disabledReason: noText,
        run: () => movePhrase(1),
      },
      {
        id: 'transport.prev',
        label: 'Back one phrase',
        group: 'Transport',
        hint: keyOf('booth.phrase.prev'),
        icon: 'previous',
        disabledReason: noText,
        run: () => movePhrase(-1),
      },
    );
    if (coldRead) {
      items.push({
        id: 'booth.cold-read',
        label: coldRead.on ? 'Stop cold read' : 'Start cold read',
        group: 'Transport',
        icon: coldRead.on ? 'stop' : 'microphone',
        disabledReason: coldRead.disabledReason ?? noText,
        run: coldRead.toggle,
      });
    }
    if (pickups.active) {
      const none = pickups.lines === 0 ? 'This pickup session has no lines.' : recording ? WHILE_RECORDING : undefined;
      items.push(
        {
          id: 'pickups.next',
          label: 'Next pickup',
          group: 'Pickups',
          hint: keyOf('booth.pickup.next'),
          icon: 'next',
          disabledReason: none,
          run: () => pickups.step(1),
        },
        {
          id: 'pickups.prev',
          label: 'Previous pickup',
          group: 'Pickups',
          hint: keyOf('booth.pickup.prev'),
          icon: 'previous',
          disabledReason: none,
          run: () => pickups.step(-1),
        },
      );
    }
    items.push({ id: 'booth.exit', label: 'Leave the Booth', group: 'Booth', hint: keyOf('booth.exit'), icon: 'close', run: exit });
    return items;
  });
}
