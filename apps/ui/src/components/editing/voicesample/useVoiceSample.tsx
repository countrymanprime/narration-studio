import { useCallback, useEffect, useRef } from 'react';
import type { TrackItem } from '../../../api/contracts/tracks';
import type { VoiceSamples } from '../../../api/contracts/voiceSamples';
import type { WorkspaceAlignmentResult } from '../../../api/contracts/workspace';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { registerSelectionAction } from '../bar/selectionActions';
import { SelectionActionButton } from '../bar/SelectionActionButton';
import { registerWordMenuSection } from '../menu/wordMenuRegistry';
import { summarize } from '../model';
import { useEditingPage } from '../script/EditingPageState';
import { VoiceSampleDialog, type Audition } from './VoiceSampleDialog';
import { characterChoices, speakerOfWord } from './voiceSampleCharacters';
import { voiceSampleRange } from './voiceSampleRange';

export interface VoiceSampleOptions {
  chapterId: string;
  /** The chapter's stored alignment: the word times, the items and the recording check they came from. */
  workspace: WorkspaceAlignmentResult;
  /** The chapter's track items, for the audio file the narrator can hear before saving. */
  items: readonly TrackItem[];
  mediaUrl: (sourceFile: string) => string;
  /** Stops the page's own playback: the dialog plays a range of its own. */
  stopPlayback: () => void;
}

export interface VoiceSample {
  /** Opens the Voice sample dialog for these words (the selection when none are given), or says why it cannot. */
  open: (keys?: readonly string[]) => void;
}

const NO_SELECTION = 'Select the words first.';
const DEFAULT_LIMIT = 20;
/** How long the Saved message, and its Undo, stays: ten seconds (the PRD's flow and the approved mock). */
const UNDO_MS = 10_000;

/**
 * Mark a voice sample from the selected words (docs/prds/character-voice-samples.prd.md, phase 3): registers the selection action and the word
 * menu's "Mark as voice sample…", and answers the V key. Every way in opens the same dialog; the page sends the item, take, range and word keys
 * from the stored alignment and never a path, and the host checks the range against the saved project, the cuts and the limits when the
 * narrator saves. Saved, it says so with Undo, which removes the sample again.
 */
export function useVoiceSample({ chapterId, workspace, items, mediaUrl, stopPlayback }: VoiceSampleOptions): VoiceSample {
  const { doc, selected } = useEditingPage();
  const storyBible = usePort('storyBible');
  const samples = usePort('voiceSamples');

  const open = useCallback(
    (keys?: readonly string[]) => {
      const picked = keys ?? selected;
      if (picked.length === 0) return overlay.toast(NO_SELECTION);
      stopPlayback();
      void (async () => {
        // What the dialog lists is read as it opens, so a character added a moment ago is there. A read that fails is said in the dialog.
        const unread: string[] = [];
        const read = <T,>(call: Promise<T>, fallback: T, what: string): Promise<T> =>
          call.catch(() => {
            unread.push(what);
            return fallback;
          });
        const [entities, cues, list] = await Promise.all([
          read(storyBible.guideEntities(), [], "the Story Bible's characters"),
          read(storyBible.guideDialogueCues(), [], "the Story Bible's speakers"),
          read<VoiceSamples | undefined>(samples.voiceSamplesList(), undefined, 'how many samples each character has'),
        ]);
        const result = voiceSampleRange(workspace, picked);
        const choices = characterChoices(entities, cues, chapterId);
        const counts: Record<string, number> = {};
        for (const sample of list?.samples ?? []) counts[sample.characterId] = (counts[sample.characterId] ?? 0) + 1;
        const speaker = result.ok ? speakerOfWord(cues, workspace.paragraphs, chapterId, result.range.startKey, entities) : undefined;
        const file = result.ok ? items.find((item) => item.guid === result.range.itemGuid)?.sourceFile : undefined;
        const audition: Audition | undefined =
          result.ok && file ? { sourceFile: file, start: result.range.sourceStart, end: result.range.sourceEnd, mediaUrl } : undefined;
        overlay.open({
          kind: 'dialog',
          title: 'Voice sample',
          dismissOnOutsidePress: false,
          render: ({ close }) => (
            <VoiceSampleDialog
              words={result.ok ? result.range.words : summarize(doc, [...picked], [], (t) => t).words}
              refusal={result.ok ? undefined : result.message}
              notice={unread.length ? `Couldn't read ${unread.join(' or ')}, so the list may be incomplete.` : undefined}
              seconds={result.ok ? result.range.sourceEnd - result.range.sourceStart : undefined}
              audition={audition}
              choices={choices}
              counts={counts}
              limit={list?.limits.perCharacter ?? DEFAULT_LIMIT}
              initialCharacterId={speaker ?? choices[0].id}
              onCancel={close}
              onSave={async (values) => {
                if (!result.ok) return { ok: false, message: result.message };
                let answer;
                try {
                  const { range } = result;
                  answer = await samples.voiceSampleMark({
                    chapterId: range.chapterId,
                    itemGuid: range.itemGuid,
                    takeGuid: range.takeGuid,
                    sourceStart: range.sourceStart,
                    sourceEnd: range.sourceEnd,
                    startKey: range.startKey,
                    endKey: range.endKey,
                    characterId: values.characterId,
                    label: values.label,
                    note: values.note,
                    makePrimary: values.makePrimary,
                    alignmentRecordId: range.alignmentRecordId,
                  });
                } catch (error) {
                  return { ok: false, message: apiErrorMessage(error) };
                }
                if (answer.status === 'refused') return { ok: false, message: answer.message };
                close();
                const name = choices.find((c) => c.id === values.characterId)?.name ?? 'this character';
                const id = answer.sample.id;
                // The host answers the sample that exists when the same frames are marked twice; Undo must not remove an earlier save.
                if (list?.samples.some((s) => s.id === id)) overlay.toast(`That stretch is already a voice sample for ${name}.`);
                else
                  overlay.toastUndo(
                    `Saved voice sample for ${name}.`,
                    () =>
                      samples
                        .voiceSampleRemove(id)
                        .then(() => ({ ok: true as const }))
                        .catch((error: unknown) => ({ ok: false as const, refusal: { reason: apiErrorMessage(error) } })),
                    { durationMs: UNDO_MS },
                  );
                return { ok: true };
              }}
            />
          ),
        });
      })();
    },
    [selected, doc, workspace, items, mediaUrl, stopPlayback, chapterId, storyBible, samples],
  );

  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    const removers = [
      registerSelectionAction({
        id: 'voice-sample',
        order: 20,
        where: 'both',
        render: ({ keys, allCut }) =>
          allCut ? null : <SelectionActionButton icon="voiceSample" label="Voice sample" hint="Mark a voice sample (V)" onClick={() => latest.current(keys)} />,
      }),
      registerWordMenuSection({
        order: 320,
        items: ({ keys, summary }) =>
          summary.items.length > 0 && summary.items.every((i) => i.cut)
            ? []
            : [{ key: 'voice-sample', label: 'Mark as voice sample…', onSelect: () => latest.current(keys) }],
      }),
    ];
    return () => removers.forEach((off) => off());
  }, []);

  return { open };
}
