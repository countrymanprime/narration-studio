import { useEffect, useState, type ReactNode } from 'react';
import type { Finding } from '../../../api/contracts/findings';
import { usePort } from '../../../ports/usePort';
import { NotesPanel } from './NotesPanel';
import { queryFor, type NoteRow, type NoteSort, type NoteWindow } from './noteRows';

/**
 * The Proof notes list wired to the host: the findings of one chapter (or all) in the order `FindingsQuery.sort` asks for.
 * No route draws it yet (SN-Q9 swaps Proof over).
 */
export function NotesList({
  chapterId,
  selectedId,
  onSelect,
  window,
  badge,
}: {
  /** The chapter in view; omitted for all chapters. */
  chapterId?: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  window?: NoteWindow;
  badge?: (row: NoteRow) => ReactNode;
}) {
  const findings = usePort('findings');
  const [sort, setSort] = useState<NoteSort>('time');
  const [page, setPage] = useState<Finding[]>([]);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let current = true;
    findings
      .findingsList(queryFor(sort, chapterId))
      .then((result) => {
        if (!current) return;
        setPage(result.findings);
        setProblem('');
      })
      .catch((reason: unknown) => current && setProblem(String(reason)));
    return () => {
      current = false;
    };
  }, [findings, sort, chapterId]);

  return (
    <>
      {problem && (
        <p role="alert" className="px-4 py-2 text-sm" style={{ color: 'var(--danger-text)' }}>
          {problem}
        </p>
      )}
      <NotesPanel
        findings={page}
        allChapters={!chapterId}
        sort={sort}
        onSortChange={setSort}
        selectedId={selectedId}
        onSelect={onSelect}
        window={window}
        badge={badge}
      />
    </>
  );
}
