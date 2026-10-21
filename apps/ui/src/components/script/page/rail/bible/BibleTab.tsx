import { useMemo } from 'react';
import { entryColour } from '../../../../../kinds/entityColour';
import { overlay } from '../../../../../overlay/overlayService';
import { usePronunciationSources } from '../../../../storybible/source/usePronunciationSources';
import { chapterName } from '../../../../../chapterName';
import { useChapters, useEntries, useParagraphs, useScriptCommands, useScriptView } from '../../data/useScriptData';
import type { WordsHost } from '../words/wordsHost';
import { openFind } from '../../tools/find/findState';
import { BiblePanel } from './BiblePanel';
import { useBibleKindChoices } from './kinds';

export type BibleTabProps = {
  chapterId: string;
  /** The Words tab's host: the miss card's dictionary block and look-up links. */
  host: WordsHost;
  /** The page opens the entry on the Story Bible page. */
  onOpenStoryBible: (entryId: string) => void;
};

/** The Story Bible tab of the Script rail: the chapter's entries and one entry read-only, over the page's data layer. */
export function BibleTab({ chapterId, host, onOpenStoryBible }: BibleTabProps) {
  const entries = useEntries();
  const kinds = useBibleKindChoices();
  const paragraphs = useParagraphs(chapterId);
  const commands = useScriptCommands();
  const chapters = useChapters();
  const { sources } = usePronunciationSources();
  const [entryId, update] = useScriptView((state) => state.entryId);
  const [miss] = useScriptView((state) => state.miss);

  const inChapter = useMemo(() => entries.entriesInChapter(paragraphs.value ?? []), [entries, paragraphs.value]);

  return (
    <BiblePanel
      entry={entries.entryById(entryId)}
      colourOf={(category) => entryColour(entries.types, category)}
      canSpeak={entries.canSpeak}
      missing={miss}
      kinds={kinds}
      entries={inChapter}
      sources={sources}
      host={host}
      tagOf={(id) => {
        const chapter = chapters.value?.find((row) => row.id === id);
        return chapter ? chapterName(chapter, 'short') : undefined;
      }}
      onPick={(id) => update({ entryId: id, miss: null, missSel: null })}
      onFind={(name) => update(openFind(name))}
      onAddNote={() => overlay.toast('Select text in the reader, then choose Mark.')}
      onOpenStoryBible={onOpenStoryBible}
      onCreate={async (kind) => {
        const id = miss ? await commands.createEntryFrom(kind, miss) : null;
        if (id) update({ entryId: id, miss: null, missSel: null });
      }}
    />
  );
}
