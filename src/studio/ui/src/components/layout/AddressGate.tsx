// What a page shows when the address that sent the narrator to it cannot be acted on (docs/reference/cross-page-handoffs.md): a
// message that says what is wrong and two ways out, in place of a blank page, a crash or a quiet landing somewhere else. It wraps a
// page's route and reads the address with `navigation/address.ts`; the page inside keeps reading its own address as before.

import { creditsKindOfId } from '../credits/creditsEntries';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { readPickupIds } from '../booth/page/boothQuery';
import { CommandScope } from '../../input/router';
import { useCommand } from '../../input/useCommand';
import { addressPagePath, readAddress, type AddressPage, type AddressRead } from '../../navigation/address';
import { Button } from '../primitives/Button';
import { BoothSkeleton } from '../booth/page/BoothSkeleton';
import { EditingBodySkeleton } from '../editing/page/EditingSkeleton';
import { ProofSkeleton } from '../proof/frame/ProofSkeleton';
import { Heading } from '../primitives/Heading';
import { Panel } from '../primitives/Panel';
import { Skeleton } from '../primitives/Skeleton';

const TITLE: Record<AddressPage, string> = {
  script: 'Script',
  'story-bible': 'Story Bible',
  editing: 'Editing',
  booth: 'Booth',
  proof: 'Proof',
  master: 'Master & QC',
  settings: 'Settings',
};

type Asked = { chapter: string; paragraph?: string };
type ListedChapter = { id: string; paragraphIds?: readonly { id: string }[] };

/** The chapter (and the line in it) an address asks for, if it asks for ones the manuscript must have. */
function askedOf(read: AddressRead): Asked | undefined {
  if (read.kind !== 'address') return undefined;
  const address = read.address;
  if (address.page === 'editing' || address.page === 'proof') return address.chapter === undefined ? undefined : { chapter: address.chapter };
  if (address.page === 'booth' && address.target && 'chapter' in address.target) {
    return { chapter: address.target.chapter, paragraph: address.target.from?.paragraphId };
  }
  return undefined;
}

/** What of an asked place the list lacks: the chapter, or a line the chapter does not have. A chapter that lists no lines cannot be checked. */
function missingFrom(asked: Asked | undefined, chapters: readonly ListedChapter[] | null): 'chapter' | 'line' | undefined {
  if (asked === undefined || chapters === null) return undefined;
  const chapter = chapters.find((item) => item.id === asked.chapter);
  // A credits file the library has no template for is not in the list; the Booth answers that with its own "not set up" panel, so the gate lets it through.
  if (!chapter) return creditsKindOfId(asked.chapter) ? undefined : 'chapter';
  if (asked.paragraph === undefined || chapter.paragraphIds === undefined) return undefined;
  return chapter.paragraphIds.some((row) => row.id === asked.paragraph) ? undefined : 'line';
}

type Check = { state: 'ok' | 'checking' } | { state: 'missing'; what: 'chapter' | 'line' };

/**
 * Whether the chapter and line an address names are in the manuscript. A place the list lacks may only be new: the list is read
 * again once before the address is called stale. `chapters` is null when it cannot be checked (no manuscript, or not read yet), and
 * the page then decides; a failed re-read is the same, because "the host did not answer" is not "the chapter is gone".
 */
function useChapterCheck(asked: Asked | undefined, chapters: readonly ListedChapter[] | null, reload: () => Promise<void>): Check {
  const key = asked === undefined ? '' : `${asked.chapter}\u0000${asked.paragraph ?? ''}`;
  const [reread, setReread] = useState<{ key: string; failed: boolean } | null>(null);
  const missing = missingFrom(asked, chapters);
  useEffect(() => {
    if (missing === undefined) return;
    let live = true;
    reload().then(
      () => live && setReread({ key, failed: false }),
      () => live && setReread({ key, failed: true }),
    );
    return () => {
      live = false;
      setReread(null);
    };
    // The list changing while a re-read is out does not start another: `missing` is what decides, and `key` is what is re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, missing === undefined]);
  if (missing === undefined) return { state: 'ok' };
  if (reread?.key !== key) return { state: 'checking' };
  return reread.failed ? { state: 'ok' } : { state: 'missing', what: missing };
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
  chapters: readonly ListedChapter[] | null;
  reloadChapters: () => Promise<void>;
  children: ReactNode;
}) {
  const { search, hash } = useLocation();
  const read = useMemo(() => readAddress(page, { search, hash, param: chapterParam }), [page, search, hash, chapterParam]);
  const check = useChapterCheck(askedOf(read), chapters, reloadChapters);
  if (read.kind === 'bad') return <BadAddress page={page} message={read.message} />;
  if (check.state === 'checking') return <CheckingLink page={page} />;
  if (check.state === 'missing') {
    const what = check.what === 'chapter' ? 'a chapter that is not in this manuscript' : 'a line that is not in that chapter';
    return <BadAddress page={page} message={`This ${TITLE[page]} link points to ${what}. It may have been removed or changed since the link was made.`} />;
  }
  return <>{children}</>;
}

const CHECKING = { label: 'Checking this link', status: 'Checking this link…' } as const;

/**
 * What stands in for the page while the chapter list is read once more: the page's own title and its loaded frame as blocks (Proof's two
 * columns, the Booth's top bar and reading column, Editing's header and script), with the one polite sentence "Checking this link…".
 */
function CheckingLink({ page }: { page: AddressPage }) {
  if (page === 'proof') return <ProofSkeleton {...CHECKING} />;
  if (page === 'booth') return <CheckingBooth />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 pb-2">
        <Heading title={TITLE[page]} />
        <Skeleton className="h-8 w-56 max-w-full" />
      </header>
      <EditingBodySkeleton {...CHECKING} />
    </div>
  );
}

/** The Booth fills the window, so a link that is only being checked shows its title and a way out in its top bar, and Escape leaves as it does from a bad link. */
function CheckingBooth() {
  const navigate = useNavigate();
  return (
    <CommandScope kind="booth">
      <LeaveBoothOnEscape />
      <BoothSkeleton
        {...CHECKING}
        title={<Heading title={TITLE.booth} />}
        exit={
          <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
            Go to Production
          </Button>
        }
      />
    </CommandScope>
  );
}

/**
 * The Booth fills the window, so its bad-address screen has no sidebar to leave by: Escape leaves it as it leaves a working Booth.
 * A link that still names pickups (`?pickups=`) opened a pickup session, which returns to Pickups; any other link returns to Script.
 * The link is all a bad address has: the page the narrator came from is not kept, so a pickup session is told by its own query.
 */
function LeaveBoothOnEscape() {
  const navigate = useNavigate();
  const { search } = useLocation();
  useCommand('booth.exit', () => {
    const session = readPickupIds(new URLSearchParams(search)).length > 0;
    navigate(session ? '/pickups' : addressPagePath('script'), { replace: true });
  });
  return null;
}

function BadAddress({ page, message }: { page: AddressPage; message: string }) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      {page === 'booth' && (
        <CommandScope kind="booth">
          <LeaveBoothOnEscape />
        </CommandScope>
      )}
      <Heading title={TITLE[page]} />
      <Panel title="This link could not be opened">
        <p role="alert" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {message}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => navigate(addressPagePath(page), { replace: true })}>
            Open {TITLE[page]}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
            Go to Production
          </Button>
        </div>
      </Panel>
    </div>
  );
}
