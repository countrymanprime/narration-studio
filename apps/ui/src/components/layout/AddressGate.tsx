// What a page shows when the address that sent the narrator to it cannot be acted on (docs/reference/cross-page-handoffs.md): a
// message that says what is wrong and two ways out, in place of a blank page, a crash or a quiet landing somewhere else. It wraps a
// page's route and reads the address with `navigation/address.ts`; the page inside keeps reading its own address as before.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { addressPagePath, readAddress, type AddressPage, type AddressRead } from '../../navigation/address';
import { Button } from '../primitives/Button';
import { Heading } from '../primitives/Heading';
import { Panel } from '../primitives/Panel';

const TITLE: Record<AddressPage, string> = {
  script: 'Script',
  'story-bible': 'Story Bible',
  editing: 'Editing',
  booth: 'Booth',
  proof: 'Proof',
  master: 'Master & QC',
  settings: 'Settings',
};

/** The chapter an address asks for, if it asks for one the manuscript must have. */
function chapterAsked(read: AddressRead): string | undefined {
  if (read.kind !== 'address') return undefined;
  const address = read.address;
  if (address.page === 'editing') return address.chapter;
  if (address.page === 'booth' && address.target && 'chapter' in address.target) return address.target.chapter;
  return undefined;
}

type Check = 'ok' | 'checking' | 'missing';

/**
 * Whether the chapter an address names is in the manuscript. A chapter the list lacks may only be new: the list is read again once
 * before the address is called stale. `chapters` is null when it cannot be checked (no manuscript, or not read yet), and the page
 * then decides; a failed re-read is the same, because "the host did not answer" is not "the chapter is gone".
 */
function useChapterCheck(asked: string | undefined, chapters: readonly { id: string }[] | null, reload: () => Promise<void>): Check {
  const [reread, setReread] = useState<{ id: string; failed: boolean } | null>(null);
  const found = asked === undefined || chapters === null || chapters.some((chapter) => chapter.id === asked);
  useEffect(() => {
    if (found || asked === undefined) return;
    let live = true;
    reload().then(
      () => live && setReread({ id: asked, failed: false }),
      () => live && setReread({ id: asked, failed: true }),
    );
    return () => {
      live = false;
      setReread(null);
    };
    // The list changing while a re-read is out does not start another: `found` is what decides, and `asked` is what is re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, found]);
  if (found) return 'ok';
  if (reread?.id !== asked) return 'checking';
  return reread.failed ? 'ok' : 'missing';
}

export function AddressGate({
  page,
  chapterParam,
  chapters,
  reloadChapters,
  children,
}: {
  page: AddressPage;
  /** The `:chapterId` the route matched, for Editing. */
  chapterParam?: string;
  chapters: readonly { id: string }[] | null;
  reloadChapters: () => Promise<void>;
  children: ReactNode;
}) {
  const { search, hash } = useLocation();
  const read = useMemo(() => readAddress(page, { search, hash, param: chapterParam }), [page, search, hash, chapterParam]);
  const check = useChapterCheck(chapterAsked(read), chapters, reloadChapters);
  if (read.kind === 'bad') return <BadAddress page={page} message={read.message} />;
  if (check === 'checking')
    return (
      <p role="status" className="p-4 text-sm text-[var(--text-muted)]">
        Checking this link…
      </p>
    );
  if (check === 'missing') {
    return (
      <BadAddress
        page={page}
        message={`This ${TITLE[page]} link points to a chapter that is not in this manuscript. It may have been removed or renamed since the link was made.`}
      />
    );
  }
  return <>{children}</>;
}

function BadAddress({ page, message }: { page: AddressPage; message: string }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Heading title={TITLE[page]} />
      <Panel title="This link could not be opened">
        <p role="alert" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {message}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => navigate(addressPagePath(page), { replace: true })}>
            Open {TITLE[page]}
          </Button>
          <Button onClick={() => navigate('/', { replace: true })}>Go to Production</Button>
        </div>
      </Panel>
    </div>
  );
}
