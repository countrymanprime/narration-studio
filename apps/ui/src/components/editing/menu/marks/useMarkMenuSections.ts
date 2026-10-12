import { useEffect, useRef } from 'react';
import { createElement } from 'react';
import { overlay } from '../../../../overlay/overlayService';
import { usePort } from '../../../../ports/usePort';
import { useJournal } from '../../../../studio/StudioProvider';
import { useMarks, useScriptCommands } from '../../../script/page/data/useScriptData';
import { registerFlagAction } from '../../flags/flagActions';
import { useEditingPage } from '../../script/EditingPageState';
import { markForPickup, markWords } from './markCommands';
import { registerMarkMenuSections } from './markMenuSections';
import { NoteDialog } from './NoteDialog';

/**
 * Puts "Mark as", "Add note…" and "Mark for pickup" in the Editing page's word menu while the page is mounted, and fills the flag card's
 * "Mark for pickup" slot with the same function. Marks go through the Script page's own command, so they are the same journalled entries.
 */
export function useMarkMenuSections(chapterId: string): void {
  const { doc } = useEditingPage();
  const { types } = useMarks();
  const { addMark } = useScriptCommands();
  const pickups = usePort('pickups');
  const journal = useJournal();
  const latest = useRef({ doc, types, addMark, chapterId });
  useEffect(() => {
    latest.current = { doc, types, addMark, chapterId };
  });

  useEffect(() => {
    const notify = (text: string) => overlay.toast(text);
    const mark = (keys: readonly string[], type: string, text = '') => {
      const { doc: now, addMark: add, chapterId: chapter } = latest.current;
      return markWords(add, notify, chapter, now, keys, type, text);
    };
    const pickup = (keys: readonly string[]) => {
      const { doc: now, chapterId: chapter } = latest.current;
      return markForPickup({ pickups, journal, overlay }, chapter, now, keys);
    };
    const removeSections = registerMarkMenuSections({
      types: () => latest.current.types,
      mark: (selection, type) => void mark(selection.keys, type.key),
      addNote: (selection) => {
        const close = overlay.open({
          kind: 'dialog',
          title: 'Add a note',
          render: ({ close: done }) =>
            createElement(NoteDialog, {
              kinds: latest.current.types.filter((t) => !t.asks),
              onSave: (type, text) => mark(selection.keys, type, text),
              onClose: done,
            }),
        });
        void close;
      },
      markForPickup: (selection) => void pickup(selection.keys),
    });
    const removeFlagAction = registerFlagAction('markForPickup', (keys) => void pickup(keys));
    return () => {
      removeSections();
      removeFlagAction();
    };
  }, [pickups, journal]);
}
