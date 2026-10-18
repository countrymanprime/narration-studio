import { useMemo, useState } from 'react';
import { describeApiError } from '../../api/errorMessage';
import { useApi } from '../../api/ApiContext';
import type { GuideEntity, GuideType } from '../../api/contracts/storyBible';
import type { VoiceSamples } from '../../api/contracts/voiceSamples';
import { usePendingAction } from '../../hooks/usePendingAction';
import { usePort } from '../../ports/usePort';
import { NARRATION_CHARACTER_ID } from '../../types';
import { Button } from '../primitives/Button';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { SlideOver } from '../primitives/SlideOver';
import type { Notify } from '../primitives/Toast';
import { useSamplePlayer, type SamplePlayer } from '../voicesamples/useSamplePlayer';
import { useVoiceSamples } from '../voicesamples/useVoiceSamples';
import { VoiceSamplesSection } from './voicesamples/VoiceSamplesSection';
import { mebibytes, moveChoices, orphanSamples } from './voicesamples/voiceSampleModel';
import { VoiceReferencesSection } from './VoiceReferencesSection';

export const ORPHAN_HEADING = 'Samples for a character that is no longer in the Story Bible';

/**
 * Project-wide voice data: Narration's voice samples and approved references, the totals, "Remove voice samples…" and "Remove voice data…" (non-acoustic
 * only: every approved reference for the project in one action), and the samples whose character has left the Story Bible. Approving a reference for
 * plain narration is a first-class subject (the approval layer accepts NARRATION_CHARACTER_ID like any other opaque character id).
 */
export function VoiceDataPanel({
  open,
  onClose,
  notify,
  entities = [],
  types = [],
  player,
}: {
  open: boolean;
  onClose: () => void;
  notify: Notify;
  /** The Story Bible's entries and types: who a sample can move to, and which samples belong to no entry any more. */
  entities?: readonly GuideEntity[];
  types?: readonly GuideType[];
  /** The page's one voice-sample player; the panel drawn alone has its own. */
  player?: SamplePlayer;
}) {
  return (
    <SlideOver open={open} title="Voice data" onClose={onClose}>
      <VoiceDataContent notify={notify} entities={entities} types={types} player={player} />
    </SlideOver>
  );
}

function VoiceDataContent({
  notify,
  entities,
  types,
  player,
}: {
  notify: Notify;
  entities: readonly GuideEntity[];
  types: readonly GuideType[];
  player?: SamplePlayer;
}) {
  const api = useApi();
  const samplesPort = usePort('voiceSamples');
  const mutation = usePendingAction();
  const own = useSamplePlayer({ notify });
  const source = useVoiceSamples();
  const [confirming, setConfirming] = useState<'samples' | 'references'>();
  // Remounts VoiceReferencesSection's own load() when a removal or the panel reopening should show the fresh
  // (now-empty) reference list, without this panel owning that data itself.
  const [refreshKey, setRefreshKey] = useState(0);
  const choices = useMemo(() => moveChoices(entities, types), [entities, types]);
  const list = source.read.status === 'ready' ? source.read.samples : source.read.status === 'failed' ? source.read.samples : undefined;
  const known = useMemo(() => new Set(choices.map((choice) => choice.id)), [choices]);
  const selectOrphans = useMemo(() => (all: VoiceSamples) => orphanSamples(all, known), [known]);

  const removeReferences = () =>
    mutation.run('remove-all', async () => {
      try {
        await api.characterRemoveVoiceData();
        notify('Every voice reference was removed.');
        setConfirming(undefined);
        setRefreshKey((key) => key + 1);
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });

  const removeSamples = () =>
    mutation.run('remove-samples', async () => {
      try {
        const removed = await samplesPort.voiceSamplesRemoveAll();
        setConfirming(undefined);
        await source.refresh();
        notify(
          removed.removed === 0
            ? 'There were no voice samples to remove.'
            : `${removed.removed === 1 ? 'One voice sample' : `${removed.removed} voice samples`} removed (${mebibytes(removed.bytes)}).`,
        );
      } catch (error) {
        notify(describeApiError(error), 'error');
      }
    });

  const sections = { source, player: player ?? own, notify, choices };
  return (
    <>
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Narration's voice samples and approved references are here - a character's own live on its entry. Remove voice data clears every approved reference in
          the project; Remove voice samples deletes every sample and its audio. Nothing else about the Story Bible changes.
        </p>
        <VoiceSamplesSection {...sections} characterId={NARRATION_CHARACTER_ID} characterName="Narration" heading="Narration voice samples" canManage />
        <VoiceReferencesSection key={refreshKey} characterId={NARRATION_CHARACTER_ID} characterLabel="Narration" notify={notify} />
        {list ? (
          <p className="m-0 text-sm text-[var(--text-muted)]" data-voice-samples-total>
            Voice samples use {mebibytes(list.totals.bytes)} of {mebibytes(list.limits.projectBytes)}.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <Button variant="danger" disabled={!list || list.totals.count === 0} onClick={() => setConfirming('samples')}>
            Remove voice samples…
          </Button>
          <Button variant="danger" onClick={() => setConfirming('references')}>
            Remove voice data…
          </Button>
        </div>
        <VoiceSamplesSection
          {...sections}
          characterId="removed"
          characterName="a removed character"
          heading={ORPHAN_HEADING}
          select={selectOrphans}
          quietWhenEmpty
          canManage
        />
      </div>
      {confirming === 'references' && (
        <ConfirmDialog
          title="Remove voice data"
          body="Revoke every approved voice reference in this project, for every character and for Narration? This cannot be undone; the manuscript, dialogue cues and everything else in the Story Bible stay as they are."
          confirmLabel="Remove voice data"
          confirmVariant="danger"
          pending={mutation.isPending('remove-all')}
          confirm={() => void removeReferences()}
          cancel={() => setConfirming(undefined)}
        />
      )}
      {confirming === 'samples' && (
        <ConfirmDialog
          title="Remove voice samples"
          body="Delete every voice sample in this project, for every character and for Narration, with their audio? This cannot be undone; the recordings they were copied from are not touched."
          confirmLabel="Remove voice samples"
          confirmVariant="danger"
          pending={mutation.isPending('remove-samples')}
          confirm={() => void removeSamples()}
          cancel={() => setConfirming(undefined)}
        />
      )}
    </>
  );
}
