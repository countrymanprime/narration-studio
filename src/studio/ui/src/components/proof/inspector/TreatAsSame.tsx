import type { Finding } from '../../../types';
import { IconButton } from '../../primitives/IconButton';
import { ALREADY_TREATED, addEquivalence, oneWordMisread, useEquivalencePending, useEquivalenceTreated, type EquivalenceApi } from './equivalence';

/**
 * "Treat these two words as the same in later checks" (#2736, an addition to the Studio Next mock): on a one-word Transcript Compare
 * misread, adds the script word and the heard word as one group to the project's equivalences, so the next comparison counts them as a
 * match. Nothing is drawn for any other note. Once the host has the pair the button is off, with "Already treated as the same" as its
 * reason. The request and its answer are `equivalence.ts`'s, outside this component.
 */
export function TreatAsSame({
  finding,
  api,
  inert = false,
  onNoteRead,
}: {
  finding: Finding;
  api: EquivalenceApi;
  /** The evidence changed: the button is off until the narrator takes the new evidence. */
  inert?: boolean;
  /** The note as the host now holds it, read again after a refusal. */
  onNoteRead: (finding: Finding) => void;
}) {
  const pending = useEquivalencePending(finding.id);
  const treated = useEquivalenceTreated(finding);
  if (!oneWordMisread(finding)) return null;
  return (
    <IconButton
      action="treatAsSame"
      disabled={inert}
      pending={pending}
      disabledReason={treated ? ALREADY_TREATED : undefined}
      onClick={() => void addEquivalence(api, finding, onNoteRead)}
    />
  );
}
