import { useMemo } from 'react';
import { overlay } from '../../../../../overlay/overlayService';
import { usePronunciationSources } from '../../../../storybible/source/usePronunciationSources';
import { useEntries, useParagraphs, useScriptCommands, useScriptView } from '../../data/useScriptData';
import { BiblePanel } from './BiblePanel';
import { BIBLE_KINDS } from './kinds';

export type BibleTabProps = {
  chapterId: string;
  /** The page opens the entry on the Story Bible page. */
  onOpenStoryBible: (entryId: string) => void;
};

/** The Story Bible tab of the Script rail: the chapter's entries and one entry read-only, over the page's data layer. */
export function BibleTab({ chapterId, onOpenStoryBible }: BibleTabProps) {
  const entries = useEntries();
  const paragraphs = useParagraphs(chapterId);
  const commands = useScriptCommands();
  const { sources } = usePronunciationSources();
  const [entryId, update] = useScriptView((state) => state.entryId);
  const [miss] = useScriptView((state) => state.miss);

  const inChapter = useMemo(() => entries.entriesInChapter(paragraphs.value ?? []), [entries, paragraphs.value]);

  return (
    <BiblePanel
      entry={entries.entryById(entryId)}
      missing={miss}
      kinds={BIBLE_KINDS}
      entries={inChapter}
      sources={sources}
      onPick={(id) => update({ entryId: id, miss: null, missSel: null })}
      onFind={(name) => update((state) => ({ find: { ...state.find, open: true, q: name, i: 0 }, findNonce: state.findNonce + 1 }))}
      onAddNote={() => overlay.toast('Select text in the reader, then choose Mark.')}
      onOpenStoryBible={onOpenStoryBible}
      onCreate={async (kind) => {
        const id = miss ? await commands.createEntryFrom(kind, miss) : null;
        if (id) update({ entryId: id, miss: null, missSel: null });
      }}
    />
  );
}
