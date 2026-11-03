import { Fragment, useState, type ReactNode } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { useApi } from '../../../api/ApiContext';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { usePort } from '../../../ports/usePort';
import { Disclosure } from '../../primitives/Disclosure';
import type { Notify } from '../../primitives/Toast';
import { TextField } from '../../primitives/TextField';
import { CommonsAudioLookup } from '../CommonsAudioLookup';
import { OnlinePronunciationLookup } from '../OnlinePronunciationLookup';
import { PronSourceTag } from './PronSourceTag';
import type { NameRow } from './pronunciationRows';
import type { PronunciationSources } from './usePronunciationSources';
import { useErrorToast } from '../../../hooks/useErrorToast';
import { pronounceFromCandidate, pronounceFromSource, pronounceOwn, pronounceUseAlternate } from '../../../studio/commands/pronounce';
import type { PronunciationCandidateRow } from '../../../api/contracts/pronunciationSources';
import { CandidatesCheckAgain, PronunciationCandidateList, usePronunciationCandidates } from './PronunciationCandidates';
import { useJournalOrOwn } from '../../../studio/StudioProvider';
import type { Result } from '../../../studio/journal/createJournal';

const OWN_SOURCES: readonly string[] = ['manual', 'user'];

/**
 * The names list's one grid: the name, how it is said, its source and the row's buttons. Every row is a subgrid of it, so the
 * columns are shared and a row with more buttons does not move the others' (alignment audit SBX-4). Below a 32 rem card the
 * rows wrap instead (`NamePronunciation`).
 */
export const NAMES_GRID = {
  // Read: the source follows the longest pronunciation, not the row's far end (SBX-2); the buttons keep the right edge.
  read: 'grid-cols-[9rem_minmax(0,max-content)_minmax(0,1fr)_auto]',
  // Edit: the pronunciation is a text box that takes the room.
  edit: 'grid-cols-[9rem_minmax(0,1fr)_auto_auto]',
  shared: 'm-0 grid list-none gap-x-2 gap-y-3 p-0 @max-[32rem]:grid-cols-[minmax(0,1fr)_auto]',
};

/** The three columns of the names grid this row fills; below a 32 rem card the row wraps as a flex line instead. */
const NAME_CELLS = 'col-span-3 grid grid-cols-subgrid gap-y-2 @max-[32rem]:col-span-1 @max-[32rem]:flex @max-[32rem]:flex-wrap @max-[32rem]:gap-2';
/** One cell on the name's line: as tall as the row's 36 px buttons, its text on their middle. */
const CELL = 'flex min-h-9 items-center';
/** A line under the row, from the pronunciation's column to the source's, so it lines up with the input above it. */
const BELOW = 'col-span-2 col-start-2 @max-[32rem]:basis-full';

/** A pronunciation breaks only between its words, never at a slash or a stress mark inside one (`/ˈælɪs/`). */
function Unbroken({ text }: { text: string }) {
  const words = text.split(' ');
  return words.map((word, index) => (
    <Fragment key={index}>
      {index > 0 && ' '}
      <span className="whitespace-nowrap">{word}</span>
    </Fragment>
  ));
}

/**
 * One name of a Story Bible entry: its say-value, read-only or an input, and the source it came from. The host writes at once
 * (each call is a sidecar run), so a press is pending while it runs and a failure is the host's sentence in a toast; there is no local draft
 * the host never sees. Typing makes the value the narrator's own. Choosing a source asks it for a candidate and writes that, or says why not.
 */
export function NamePronunciation({
  entityId,
  row,
  editing,
  locked = false,
  sources,
  reload,
  notify,
  primary = false,
  badge,
  note,
  showName = true,
}: {
  entityId: string;
  row: NameRow;
  editing: boolean;
  locked?: boolean;
  sources: PronunciationSources;
  reload: () => Promise<void>;
  notify: Notify;
  /** The entry's own name, drawn heavier than its aliases so the two read apart. */
  primary?: boolean;
  /** Drawn after the source, on the name's line (the alias's "Needs review"). */
  badge?: ReactNode;
  /** A line under the row, in the pronunciation's column. */
  note?: ReactNode;
  /** False where the name is already the heading over the row (Script's Words card): the row is then how it is said and its source. */
  showName?: boolean;
}) {
  const api = useApi();
  const journal = useJournalOrOwn();
  const port = usePort('pronunciationSources');
  const mutation = usePendingAction();
  useErrorToast(sources.error);
  const { name, aliasIndex, pronunciation } = row;
  const [text, setText] = useState(pronunciation.ipa);
  const [shown, setShown] = useState(pronunciation.ipa);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  // Each source is a sidecar run: the dictionaries are asked only once the narrator opens their list.
  const candidates = usePronunciationCandidates(name, editing && candidatesOpen);
  // The host's value changed under the field (a source was applied, the alternate came back): show it.
  if (pronunciation.ipa !== shown) {
    setShown(pronunciation.ipa);
    setText(pronunciation.ipa);
  }
  const key = aliasIndex === undefined ? 'entry' : `alias-${aliasIndex}`;

  const target = { entryId: entityId, aliasIndex, name, prior: pronunciation };
  // Every change is one journal entry through the shared commands (#2595), so Undo works from this grid and from Script's Words card alike.
  const done = async (result: Result<unknown>, success: string): Promise<boolean> => {
    if (!result.ok) {
      notify(result.refusal.reason, 'error');
      return false;
    }
    notify(success);
    await reload();
    return true;
  };

  const commit = () =>
    text === pronunciation.ipa || text.trim() === ''
      ? undefined
      : mutation.run(`${key}-own`, async () => {
          if (!(await done(await pronounceOwn(journal, api, target, text), 'Your pronunciation is in use.'))) setText(pronunciation.ipa);
        });

  const pick = (id: string) =>
    mutation.run(`${key}-source`, async () => {
      const source = sources.sources.find((row) => row.id === id);
      if (!source) return;
      // Manual keeps the text as it is; only the source changes.
      if (source.kind === 'manual') return void (await done(await pronounceOwn(journal, api, target, text), 'Your pronunciation is in use.'));
      let candidate: Awaited<ReturnType<typeof port.pronunciationCandidate>>;
      try {
        candidate = await port.pronunciationCandidate(name, id);
      } catch (error) {
        return notify(describeApiError(error), 'error');
      }
      if (!candidate.ok) return notify(candidate.reason);
      // The online source is not one the host can pronounce from by id; its answer is saved as the narrator's own, as "Use this" does.
      const result =
        source.needs === 'network'
          ? await pronounceOwn(journal, api, target, candidate.say)
          : await pronounceFromSource(journal, api, target, { id, label: source.label });
      await done(result, `Pronunciation from ${source.label}.`);
    });

  const pickCandidate = (candidate: PronunciationCandidateRow) =>
    mutation.run(
      `${key}-candidate`,
      async () => void (await done(await pronounceFromCandidate(journal, api, target, candidate), `Pronunciation from ${candidate.label}.`)),
    );

  const switchToAlternate = () =>
    mutation.run(`${key}-alternate`, async () => void (await done(await pronounceUseAlternate(journal, api, target), 'Pronunciation switched.')));

  const own = OWN_SOURCES.includes(pronunciation.source);
  const alternate = pronunciation.alternate ? { label: own ? 'Use the dictionary’s' : 'Use mine', onUse: () => void switchToAlternate() } : undefined;
  const busy = mutation.isBusy;

  return (
    // Three cells of the names grid (GuideDetail's `NAMES_GRID`): the name, how it is said, and its source. The grid is shared by
    // every row, so a name, a pronunciation and a source button start at one x down the list whatever each row holds; the row's
    // action buttons are the fourth cell. In a narrow card the cells wrap instead, the name on a line of its own.
    <div className={NAME_CELLS} data-name={name}>
      {showName && <span className={`${CELL} ${primary ? 'font-semibold' : 'font-medium'} @max-[32rem]:basis-full`}>{name}</span>}
      {editing ? (
        <div className={`${CELL} min-w-[8rem] @max-[32rem]:flex-1`}>
          <TextField
            label={`How I say ${name}`}
            mono
            placeholder="for example: kroh-KAY"
            value={text}
            disabled={locked || mutation.isBlockedFor(`${key}-own`)}
            onChange={setText}
            onBlur={() => void commit()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void commit();
            }}
          />
        </div>
      ) : (
        <span className={`${CELL} min-w-0 font-['IBM_Plex_Mono',ui-monospace,monospace] @max-[32rem]:flex-1`}>
          <Unbroken text={pronunciation.ipa || '—'} />
        </span>
      )}
      <div className={`${CELL} flex-wrap gap-2`}>
        {(editing || pronunciation.ipa) && (
          <PronSourceTag
            src={pronunciation.source}
            sources={sources.sources}
            word={name}
            onPick={editing ? (id) => void pick(id) : undefined}
            alternate={editing ? alternate : undefined}
            pending={mutation.isPending(`${key}-source`) || mutation.isPending(`${key}-alternate`)}
            disabled={locked || busy}
          />
        )}
        {badge}
      </div>
      {note && <div className={BELOW}>{note}</div>}
      {editing && (
        <Disclosure title="From the dictionaries" open={candidatesOpen} onOpenChange={setCandidatesOpen} className={BELOW}>
          <div className="pt-1">
            {candidates.status === 'error' ? (
              <CandidatesCheckAgain view={candidates} />
            ) : candidates.status === 'ready' && candidates.answer.candidates.length === 0 ? (
              <p className="m-0 text-xs text-[var(--text-muted)]">No dictionary has “{name}”.</p>
            ) : (
              <PronunciationCandidateList
                word={name}
                candidates={candidates.answer.candidates}
                inUse={{ say: pronunciation.ipa, source: pronunciation.source }}
                onUse={(candidate) => void pickCandidate(candidate)}
                disabled={locked || busy}
              />
            )}
          </div>
        </Disclosure>
      )}
      {editing && (
        <Disclosure title="Look up elsewhere" open={detailsOpen} onOpenChange={setDetailsOpen} className={BELOW}>
          <div className="space-y-2 pt-1">
            <OnlinePronunciationLookup name={name} disabled={locked || busy} onUse={setText} />
            <CommonsAudioLookup name={name} disabled={locked || busy} />
          </div>
        </Disclosure>
      )}
    </div>
  );
}
