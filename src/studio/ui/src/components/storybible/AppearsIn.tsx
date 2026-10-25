import type { ReactNode } from 'react';
import type { GuideEntity } from '../../types';
import { headingName } from '../../chapterHeading';
import { IconButton } from '../primitives/IconButton';
import { chaptersOf, type ChapterRef } from './appearsInModel';

/** "Appears in · N chapters": one row per chapter the entry is in, each with a button that opens the chapter in Script. */
export function AppearsIn({
  entity,
  manuscript,
  onGo,
  action,
}: {
  entity: Pick<GuideEntity, 'appearances'> & Partial<Pick<GuideEntity, 'occurrences'>>;
  manuscript: readonly ChapterRef[];
  onGo: (chapterId: string) => void;
  /** A control at the right of the heading, for what refreshes the list (the entry's Rescan). */
  action?: ReactNode;
}) {
  const chapters = chaptersOf(entity, manuscript);
  const count = chapters?.length ?? 0;
  return (
    <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }} data-testid="appears-in">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[0.82rem] font-medium text-[var(--text-muted)]">
        <span>
          Appears in · {count} {count === 1 ? 'chapter' : 'chapters'}
        </span>
        {action}
      </div>
      {chapters === undefined ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Not listed yet. Build the Story Bible again to list the chapters.
        </p>
      ) : chapters.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Not mentioned in a chapter with text yet.
        </p>
      ) : (
        <ul>
          {chapters.map((chapter) => (
            <li key={chapter.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0" style={{ borderColor: 'var(--border)' }}>
              <span className="min-w-0 flex-1 text-sm break-words">{headingName(chapter)}</span>
              <IconButton action="goToChapter" label={`Go to ${headingName(chapter)}`} className="flex-none" onClick={() => onGo(chapter.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
