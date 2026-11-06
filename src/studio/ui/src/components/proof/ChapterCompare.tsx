import { useState } from 'react';
import { chapterName } from '../../chapterName';
import type { ManuscriptChapter, TranscriptState } from '../../types';
import type { Notify } from '../primitives/Toast';
import { ToggleGroup } from '../primitives/ToggleGroup';
import { CompareRun } from './CompareRun';
import { NativeTakesPanel } from './NativeTakesPanel';
import { PreviewPanel } from './PreviewPanel';
import { useChapterCompare } from './useChapterCompare';

type CompareTab = 'differences' | 'preview' | 'native';

const TABS: { value: CompareTab; label: string }[] = [
  { value: 'differences', label: 'Differences' },
  { value: 'preview', label: 'Preview' },
  { value: 'native', label: 'Native takes' },
];

export interface ChapterCompareProps {
  chapter: ManuscriptChapter;
  /** The app-wide Transcript Compare state (one run at a time, from the host's transcript event). */
  transcript: TranscriptState;
  notify: Notify;
  /** Starting a comparison and exporting markers need a linked DAW project file. */
  dawFileLinked: boolean;
  goToManuscript: (chapter: string, paragraph?: number) => void;
}

/**
 * Compare on the Proof page (#2822), under the check card for the chapter in view: the comparison's run and result (`CompareRun`), the preview of the
 * chapter's audio (`PreviewPanel`) and the native takes (`NativeTakesPanel`), one at a time behind tabs. The same components the chapter view
 * (`/proof/:chapterId`) draws one under the other, fed by the same `useChapterCompare`; nothing here is a second copy of them.
 */
export function ChapterCompare({ chapter, transcript, notify, dawFileLinked, goToManuscript }: ChapterCompareProps) {
  const [tab, setTab] = useState<CompareTab>('differences');
  const compare = useChapterCompare(chapter, transcript);
  return (
    <section aria-label="Compare" data-chapter-compare="" className="flex flex-col gap-3">
      <ToggleGroup label="Compare view" look="segmented" value={tab} onChange={(value) => setTab(value as CompareTab)} options={TABS} />
      {tab === 'differences' ? (
        <CompareRun
          chapterTitle={chapterName(chapter, 'short')}
          state={transcript}
          notify={notify}
          dawFileLinked={dawFileLinked}
          lastCompleted={compare.lastCompleted}
          reviewingLast={compare.reviewingLast}
          onReviewLast={() => compare.setReviewingLast(true)}
          onCloseLast={() => compare.setReviewingLast(false)}
          foundHere={compare.foundHere}
        />
      ) : tab === 'preview' ? (
        <PreviewPanel notify={notify} goToManuscript={goToManuscript} />
      ) : (
        <NativeTakesPanel
          chapter={chapter}
          whenEmpty={
            <p role="status" className="m-0 text-sm text-[var(--text-muted)]">
              The app's recorder has no takes for this chapter. Takes it records and puts on a line are listed here.
            </p>
          }
        />
      )}
    </section>
  );
}
