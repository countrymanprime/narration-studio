import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../../../primitives/Button';
import { IconButton } from '../../../../primitives/IconButton';
import { TooltipTarget } from '../../../../primitives/Tooltip';
import { useBookmarks } from '../../../bookmarks/model/useBookmarks';
import { useEntries, useMarks, useScriptCommands, useScriptView } from '../../data/useScriptData';
import { BIBLE_KINDS } from '../../rail/bible/kinds';
import type { ReaderSelection } from '../../registry/contextProvider';
import type { ToolSelection } from './getSelection';
import { KindMenu } from './KindMenu';
import { lookupTarget } from './lookupTarget';
import { MarkMenu } from './MarkMenu';

export const ACROSS_PARAGRAPHS = 'Select within one paragraph.';
const ABOVE = 46;
const EDGE = 8;

type Props = {
  /** The reader's selection; null for a caret, and the toolbar is not drawn. */
  selection: ToolSelection | null;
  /** The page's zoom factor: the rectangle is in screen pixels, the toolbar in the page's. */
  zoom?: number;
  onDismiss: () => void;
  /** Opens the mark composer for a type on the selection. */
  onCompose: (type: string, selection: ReaderSelection) => void;
  /** Opens the Define marks dialog. */
  onDefineMarks: () => void;
  /** Starts a recording at the selection; omitted before the Booth swap, and then the button is not drawn. */
  onRecordHere?: (selection: ReaderSelection) => void;
};

/**
 * The small toolbar over a selection in the reader (the mock's `SelectionTool`): Mark, Story Bible and Look up, with Bookmark
 * here and Record here as icon buttons. Across paragraphs it is one disabled button saying why. It follows the selection's
 * rectangle, and Escape or a press elsewhere dismisses it. A press on it keeps the selection.
 */
export function SelectionTool({ selection, zoom = 1, onDismiss, onCompose, onDefineMarks, onRecordHere }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { types } = useMarks();
  const { entries } = useEntries();
  const commands = useScriptCommands();
  const bookmarks = useBookmarks();
  const [, updateView] = useScriptView(() => null);
  const present = selection !== null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !selection) return;
    const width = el.getBoundingClientRect().width / zoom;
    const { rect } = selection;
    el.style.left = `${Math.max(EDGE, Math.min(rect.left / zoom + rect.width / zoom / 2 - width / 2, document.documentElement.clientWidth - width - EDGE))}px`;
    el.style.top = `${Math.max(EDGE, rect.top / zoom - ABOVE)}px`;
  });

  useEffect(() => {
    if (!present) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    const away = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && !ref.current?.contains(target) && !target.closest('[role="menu"]')) onDismiss();
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('mousedown', away);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('mousedown', away);
    };
  }, [present, onDismiss]);

  if (!selection) return null;
  const keep = (event: { preventDefault: () => void }) => event.preventDefault();
  const place = !('multi' in selection && selection.multi) ? (selection as ReaderSelection) : null;

  return createPortal(
    <div
      ref={ref}
      role="toolbar"
      aria-label="Selection tools"
      onMouseDown={keep}
      className="fixed isolate z-[65] flex items-center gap-1 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-1 shadow-[var(--shadow-lg)]"
    >
      {place === null ? (
        <Button variant="secondary" size="sm" disabled>
          {ACROSS_PARAGRAPHS}
        </Button>
      ) : (
        <>
          <MarkMenu
            types={types}
            onMark={(type) => {
              onDismiss();
              onCompose(type, place);
            }}
            onFlagWord={() => {
              onDismiss();
              void commands.flagWord(place).then((word) => word && updateView({ tab: 'pron', word: word.word }));
            }}
            onDefine={() => {
              onDismiss();
              onDefineMarks();
            }}
          />
          <KindMenu
            kinds={BIBLE_KINDS}
            onChoose={(kind) => {
              onDismiss();
              void commands.createEntryFrom(kind, place.quote).then((entryId) => entryId && updateView({ tab: 'bible', entryId, miss: null, missSel: null }));
            }}
          />
          <IconButton
            action="bookmark"
            label="Bookmark here"
            onClick={() => {
              onDismiss();
              void bookmarks.add({ chapterId: place.chapterId, paragraphId: place.paragraphId, offset: place.start });
            }}
          />
          {onRecordHere && (
            <IconButton
              action="recordHere"
              label="Record here"
              onClick={() => {
                onDismiss();
                onRecordHere(place);
              }}
            />
          )}
          <TooltipTarget text="Look the selected words up in the dictionary or the Story Bible">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onDismiss();
                const target = lookupTarget(place.quote, entries);
                if (target.tab === 'pron') updateView({ tab: 'pron', word: target.word });
                else if ('entryId' in target) updateView({ tab: 'bible', entryId: target.entryId, miss: null, missSel: null });
                else updateView({ tab: 'bible', entryId: null, miss: target.miss, missSel: place });
              }}
            >
              Look up
            </Button>
          </TooltipTarget>
        </>
      )}
    </div>,
    // Inside the app's `<main>`, so the toolbar is in a landmark (axe `region`); it is `fixed`, so where it sits in the tree does not move it.
    document.querySelector('main') ?? document.body,
  );
}
