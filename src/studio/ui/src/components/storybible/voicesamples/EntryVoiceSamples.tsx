import type { GuideEntity, GuideType } from '../../../api/contracts/storyBible';
import type { Notify } from '../../primitives/Toast';
import { useSamplePlayer, type SamplePlayer } from '../../voicesamples/useSamplePlayer';
import { useVoiceSamples } from '../../voicesamples/useVoiceSamples';
import { VoiceSamplesSection } from './VoiceSamplesSection';
import { moveChoices } from './voiceSampleModel';

/**
 * A character entry's **Voice samples** section. The Story Bible page owns the one player and passes it down; an entry drawn alone (a story,
 * a unit test) has its own. Move and Delete are offered only while the entry is being edited (`canManage`).
 */
export function EntryVoiceSamples({
  entity,
  entities,
  types,
  canManage,
  player,
  notify,
}: {
  entity: Pick<GuideEntity, 'id' | 'canonical_name'>;
  entities: readonly GuideEntity[];
  types: readonly GuideType[];
  canManage: boolean;
  player?: SamplePlayer;
  notify: Notify;
}) {
  const own = useSamplePlayer({ notify });
  const source = useVoiceSamples();
  const props = {
    source,
    characterId: entity.id,
    characterName: entity.canonical_name,
    canManage,
    player: player ?? own,
    notify,
    choices: moveChoices(entities, types),
  };
  return <VoiceSamplesSection {...props} />;
}
