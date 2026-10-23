import { useState } from 'react';
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

const OWN_SOURCES: readonly string[] = ['manual', 'user'];

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
}: {
  entityId: string;
  row: NameRow;
  editing: boolean;
  locked?: boolean;
  sources: PronunciationSources;
  reload: () => Promise<void>;
  notify: Notify;
}) {
  const api = useApi();
  const port = usePort('pronunciationSources');
  const mutation = usePendingAction();
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
    <div className="space-y-2" data-name={name}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[8rem] font-medium">{name}</span>
        {editing ? (
          <div className="min-w-[8rem] flex-1">
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
          <span className="flex-1 font-['IBM_Plex_Mono',ui-monospace,monospace]">{pronunciation.ipa || '—'}</span>
        )}
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
      </div>
      {sources.error && (
        <p role="alert" className="text-xs text-[var(--danger-text)]">
          {sources.error}
        </p>
      )}
      {editing && (
        <Disclosure title="Look up elsewhere" open={detailsOpen} onOpenChange={setDetailsOpen}>
          <div className="space-y-2 pl-5">
            <OnlinePronunciationLookup name={name} disabled={locked || busy} onUse={setText} />
            <CommonsAudioLookup name={name} disabled={locked || busy} />
          </div>
        </Disclosure>
      )}
    </div>
  );
}
