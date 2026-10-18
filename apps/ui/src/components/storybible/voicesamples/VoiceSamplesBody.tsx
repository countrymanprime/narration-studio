import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../primitives/Button';
import type { VoiceSample, VoiceSamples } from '../../../api/contracts/voiceSamples';
import type { Notify } from '../../primitives/Toast';
import type { SamplePlayer } from '../../voicesamples/useSamplePlayer';
import type { useVoiceSamples } from '../../voicesamples/useVoiceSamples';
import type { MoveChoice } from './MoveVoiceSampleDialog';
import { voiceSampleRowId, VoiceSampleRow } from './VoiceSampleRow';
import { mebibytes, samplesOf } from './voiceSampleModel';
import { useVoiceSampleActions } from './useVoiceSampleActions';

export const NO_SAMPLES_YET = 'No voice samples yet. Mark one in Editing: select words you voiced well and press V.';

/**
 * One character's (or Narration's) voice samples, self-fetching like the Story Bible's other sections (docs/prds/character-voice-samples.prd.md,
 * the mock's "Character entry"): the host's list read when the section opens and again whenever it changes, a play control and the story of each
 * sample, and the ⋯ menu. `canManage` is whether Move and Delete are offered: an entry offers them only after Edit, the Voice data panel always.
 * After a delete focus moves to the next row, or to the heading when none is left.
 */
export type VoiceSamplesBodyProps = Parameters<typeof VoiceSamplesBody>[0];

export function VoiceSamplesBody({
  source,
  characterId,
  characterName,
  heading = 'Voice samples',
  select,
  quietWhenEmpty = false,
  canManage,
  player,
  notify,
  choices,
  openEditing,
}: {
  /** The page's one read of the project's samples (`useVoiceSamples`), shared by every section it draws. */
  source: ReturnType<typeof useVoiceSamples>;
  /** Names the section (its heading id) and, unless `select` says otherwise, which samples it lists. */
  characterId: string;
  characterName: string;
  heading?: string;
  /** Which samples this section lists; the character's own by default. */
  select?: (list: VoiceSamples) => VoiceSample[];
  /** Draws nothing at all when the list is empty (the samples of a removed character, which most projects have none of). */
  quietWhenEmpty?: boolean;
  canManage: boolean;
  player: SamplePlayer;
  notify: Notify;
  /** Every character a sample can move to, with Narration. */
  choices: readonly MoveChoice[];
  /** Takes the narrator to Editing (to a chapter when given one); a page with no router passes none and draws no link. */
  openEditing?: (chapterId?: string) => void;
}) {
  const { read, refresh } = source;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [checking, setChecking] = useState(false);
  const pendingFocus = useRef<string | undefined>(undefined);
  const list = read.status === 'ready' ? read.samples : read.status === 'failed' ? read.samples : undefined;
  const mine = useMemo(() => (list ? (select ? select(list) : samplesOf(list, characterId)) : []), [list, characterId, select]);
  const counts = useMemo(() => {
    const byCharacter: Record<string, number> = {};
    for (const sample of list?.samples ?? []) byCharacter[sample.characterId] = (byCharacter[sample.characterId] ?? 0) + 1;
    return byCharacter;
  }, [list]);
  const limit = list?.limits.perCharacter ?? 20;

  const { actions, dialogs } = useVoiceSampleActions({
    notify,
    refresh,
    choices,
    counts,
    limit,
    nameOf: () => characterName,
    onRemoved: (sample) => {
      const index = mine.findIndex((candidate) => candidate.id === sample.id);
      pendingFocus.current = (mine[index + 1] ?? mine[index - 1])?.id ?? 'heading';
    },
    onClosed: (sample) => {
      document.getElementById(voiceSampleRowId(sample.id))?.querySelector<HTMLElement>('button[aria-haspopup="menu"]')?.focus();
    },
  });

  // Focus follows a delete or a move once the list has been read again without the row.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === undefined) return;
    pendingFocus.current = undefined;
    if (target === 'heading') return void headingRef.current?.focus();
    const next = document.getElementById(voiceSampleRowId(target))?.querySelector<HTMLElement>('button');
    (next ?? headingRef.current)?.focus();
  }, [read]);

  const checkAgain = useCallback(async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  }, [refresh]);

  const bytes = mine.reduce((total, sample) => total + sample.bytes, 0);
  const full = mine.length >= limit;

  if (quietWhenEmpty && list && mine.length === 0 && read.status === 'ready') return <>{dialogs}</>;

  return (
    <section aria-labelledby={`voice-samples-${characterId}`} data-voice-samples>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <h3 id={`voice-samples-${characterId}`} ref={headingRef} tabIndex={-1} className="m-0 text-[0.82rem] font-medium text-[var(--text-muted)] outline-none">
          {heading}
        </h3>
        {mine.length > 0 ? (
          <span className="text-sm text-[var(--text-muted)]" data-voice-samples-count>
            {mine.length} · {mebibytes(bytes)}
          </span>
        ) : null}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" pending={checking} onClick={() => void checkAgain()}>
          Check again
        </Button>
      </div>
      {read.status === 'loading' ? (
        <p aria-busy="true" className="m-0 text-sm text-[var(--text-muted)]">
          Reading voice samples…
        </p>
      ) : null}
      {read.status === 'failed' ? (
        <p role="alert" className="m-0 mb-2 text-sm" style={{ color: 'var(--danger-text)' }}>
          {read.samples
            ? `Couldn't read the voice samples again, so this list may be out of date. ${read.message}`
            : `Couldn't read the voice samples. ${read.message}`}
        </p>
      ) : null}
      {list && mine.length === 0 ? (
        <>
          <p className="m-0 mb-2 text-sm text-[var(--text-muted)]">{NO_SAMPLES_YET}</p>
          {openEditing ? (
            <Button variant="secondary" size="sm" onClick={() => openEditing()}>
              Open Editing
            </Button>
          ) : null}
        </>
      ) : null}
      {mine.length > 0 ? (
        <>
          {full ? (
            <p className="m-0 mb-2 text-sm text-[var(--text-muted)]">
              {characterName} has {limit} samples, the most a character can have.
            </p>
          ) : null}
          <ul className="m-0 list-none space-y-1.5 p-0">
            {mine.map((sample) => (
              <VoiceSampleRow
                key={sample.id}
                sample={sample}
                characterName={characterName}
                status={player.isActive(sample.id) ? player.status : 'idle'}
                progress={player.isActive(sample.id) ? player.progress : 0}
                onPlay={() => void player.play(sample.id, { name: characterName })}
                onStop={player.stop}
                canManage={canManage}
                onRename={() => actions.rename(sample)}
                onMakePrimary={() => actions.makePrimary(sample)}
                onMove={() => actions.move(sample)}
                onDelete={() => actions.remove(sample)}
                onOpenEditing={openEditing ? () => openEditing(sample.source.chapterId) : undefined}
                onNotice={(text) => notify(text)}
              />
            ))}
          </ul>
        </>
      ) : null}
      {dialogs}
    </section>
  );
}
