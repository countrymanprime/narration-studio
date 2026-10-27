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

const OWN_SOURCES: readonly string[] = ['manual', 'user'];

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
}) {
  const api = useApi();
  const port = usePort('pronunciationSources');
  const mutation = usePendingAction();
  useErrorToast(sources.error);
  const { name, aliasIndex, pronunciation } = row;
  const [text, setText] = useState(pronunciation.ipa);
  const [shown, setShown] = useState(pronunciation.ipa);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // The host's value changed under the field (a source was applied, the alternate came back): show it.
  if (pronunciation.ipa !== shown) {
    setShown(pronunciation.ipa);
    setText(pronunciation.ipa);
  }
  const key = aliasIndex === undefined ? 'entry' : `alias-${aliasIndex}`;

  const writeOwn = (ipa: string) => {
    const args: Parameters<typeof api.guidePronounceUser> = aliasIndex === undefined ? [entityId, ipa] : [entityId, ipa, aliasIndex];
    return api.guidePronounceUser(...args);
  };
  const failed = (error: unknown) => notify(describeApiError(error), 'error');

  const commit = () =>
    text === pronunciation.ipa || text.trim() === ''
      ? undefined
      : mutation.run(`${key}-own`, async () => {
          try {
            await writeOwn(text);
            notify('Your pronunciation is in use.');
            await reload();
          } catch (error) {
            setText(pronunciation.ipa);
            failed(error);
          }
        });

  const pick = (id: string) =>
    mutation.run(`${key}-source`, async () => {
      const source = sources.sources.find((row) => row.id === id);
      if (!source) return;
      try {
        if (source.kind === 'manual') {
          // The text stays as it is; only the source changes.
          await writeOwn(text);
          notify('Your pronunciation is in use.');
        } else {
          const candidate = await port.pronunciationCandidate(name, id);
          if (!candidate.ok) {
            notify(candidate.reason);
            return;
          }
          if (source.needs === 'network') {
            // The online source is not one the host can pronounce from by id; its answer is saved as the narrator's own, as "Use this" does.
            await writeOwn(candidate.say);
          } else {
            const args: Parameters<typeof api.guidePronounce> = aliasIndex === undefined ? [entityId, id] : [entityId, id, aliasIndex];
            await api.guidePronounce(...args);
          }
          notify(`Pronunciation from ${source.label}.`);
        }
        await reload();
      } catch (error) {
        failed(error);
      }
    });

  const switchToAlternate = () =>
    mutation.run(`${key}-alternate`, async () => {
      try {
        const args: Parameters<typeof api.guidePronunciationUseAlternate> = aliasIndex === undefined ? [entityId] : [entityId, aliasIndex];
        await api.guidePronunciationUseAlternate(...args);
        notify('Pronunciation switched.');
        await reload();
      } catch (error) {
        failed(error);
      }
    });

  const own = OWN_SOURCES.includes(pronunciation.source);
  const alternate = pronunciation.alternate ? { label: own ? 'Use the dictionary’s' : 'Use mine', onUse: () => void switchToAlternate() } : undefined;
  const busy = mutation.isBusy;

  return (
    // Three cells of the names grid (GuideDetail's `NAMES_GRID`): the name, how it is said, and its source. The grid is shared by
    // every row, so a name, a pronunciation and a source button start at one x down the list whatever each row holds; the row's
    // action buttons are the fourth cell. In a narrow card the cells wrap instead, the name on a line of its own.
    <div className={NAME_CELLS} data-name={name}>
      <span className={`${CELL} ${primary ? 'font-semibold' : 'font-medium'} @max-[32rem]:basis-full`}>{name}</span>
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
