import type { ContextMenuItem } from '../../primitives/ContextMenu';
import { registerWordMenuSection, type WordMenuSelection } from './wordMenuRegistry';

/** Why Play selection is off, or undefined when the selection has audio. */
function playRefusal({ doc, summary }: WordMenuSelection): string | undefined {
  if (!doc.aligned) return 'Nothing has been transcribed yet.';
  if (summary.audible.length === 0) return 'There is no audio for these words.';
  return undefined;
}

function playItems(selection: WordMenuSelection): ContextMenuItem[] {
  const unavailable = playRefusal(selection);
  return [
    {
      key: 'play-selection',
      label: 'Play selection',
      ...(unavailable !== undefined ? { unavailable } : {}),
      onSelect: () => selection.play(selection.summary.start, selection.summary.end),
    },
  ];
}

/** The words as the script has them; a word that was only said is copied as it was said. */
const copiedText = ({ summary }: WordMenuSelection): string => summary.items.map((i) => i.text).join(' ');

function copyItems(selection: WordMenuSelection): ContextMenuItem[] {
  return [
    {
      key: 'copy-words',
      label: 'Copy words',
      onSelect: () => {
        const count = selection.summary.items.length;
        void navigator.clipboard?.writeText(copiedText(selection)).then(
          () => selection.notify(`Copied ${count} ${count === 1 ? 'word' : 'words'}.`),
          () => selection.notify('Could not copy the words.'),
        );
      },
    },
  ];
}

/** Play selection leads the menu; Copy words closes it. */
export const registerPlayAndCopySections = (): (() => void) => {
  const removers = [registerWordMenuSection({ order: 10, items: playItems }), registerWordMenuSection({ order: 900, items: copyItems })];
  return () => removers.forEach((remove) => remove());
};
