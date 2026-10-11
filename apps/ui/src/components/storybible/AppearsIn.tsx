import type { GuideEntity } from '../../types';
import { chapterName } from '../../chapterName';
import { IconButton } from '../primitives/IconButton';
import { chaptersOf, type ChapterRef } from './appearsIn';

/** "Appears in · N chapters": one row per chapter the entry is in, each with a button that opens the chapter in Script. */
export function AppearsIn({
  entity,
  manuscript,
  onGo,
}: {
  entity: Pick<GuideEntity, 'appearances'>;
  manuscript: readonly ChapterRef[];
  onGo: (chapterId: string) => void;
}) {
  const chapters = chaptersOf(entity, manuscript);
  const count = chapters?.length ?? 0;
  return (
    <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }} data-testid="appears-in">
      <div className="mb-1.5 text-[0.82rem] font-medium text-[var(--text-muted)]">
        Appears in · {count} {count === 1 ? 'chapter' : 'chapters'}
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
              <span className="min-w-0 flex-1 text-sm break-words">{chapterName(chapter)}</span>
              <IconButton action="goToChapter" label={`Go to ${chapterName(chapter)}`} className="flex-none" onClick={() => onGo(chapter.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
