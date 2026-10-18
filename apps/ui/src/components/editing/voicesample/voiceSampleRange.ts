import { VOICE_SAMPLE_SENTENCES, type VoiceSampleRefusalReason } from '../../../api/contracts/voiceSamples';
import type { WorkspaceAlignmentResult, WorkspaceToken } from '../../../api/contracts/workspace';

/** The stretch of one take a selection names: what `VoiceSampleMark` needs of the words, in the item's own source seconds. */
export type VoiceRange = {
  chapterId: string;
  itemGuid: string;
  takeGuid: string;
  sourceStart: number;
  sourceEnd: number;
  /** `paragraphId:ordinal` of the first and last heard script word. */
  startKey: string;
  endKey: string;
  /** The script words from the first to the last heard one, as the sample will record them. */
  words: string;
  /** The recording check the word times came from. */
  alignmentRecordId: string;
};

export type VoiceRangeRefusal = {
  ok: false;
  reason: Extract<VoiceSampleRefusalReason, 'stale_alignment' | 'not_heard' | 'spans_takes'> | 'nothing_selected';
  message: string;
};
export type VoiceRangeResult = { ok: true; range: VoiceRange } | VoiceRangeRefusal;

const refused = (reason: VoiceRangeRefusal['reason']): VoiceRangeRefusal => ({
  ok: false,
  reason,
  message: reason === 'nothing_selected' ? 'Select the words first.' : VOICE_SAMPLE_SENTENCES[reason],
});

type Heard = WorkspaceToken & { item: number; start: number; end: number };
const isHeard = (token: WorkspaceToken | undefined): token is Heard =>
  token !== undefined &&
  (token.status === 'read' || token.status === 'misread') &&
  token.item !== undefined &&
  token.start !== undefined &&
  token.end !== undefined;

/**
 * The one stretch of one take that the selected keys name, from the chapter's stored alignment, or why they name none. Only words of the
 * script count: a word that was said and is not in it has no key the host can find. The range runs from the first heard word to the last,
 * in the item's source seconds, and the words are the script's between them. The page asks nothing of the DAW here; the host checks the
 * range against the saved project, the cuts and the limits when the narrator saves, and says why it refuses.
 */
export function voiceSampleRange(alignment: WorkspaceAlignmentResult, keys: readonly string[]): VoiceRangeResult {
  if (keys.length === 0) return refused('nothing_selected');
  const byKey = new Map(alignment.tokens.filter((t) => t.p !== undefined).map((t) => [`${t.p}:${t.w}`, t]));
  const heard = keys.map((key) => byKey.get(key)).filter(isHeard);
  if (heard.length === 0) return refused('not_heard');
  // A check that is not current names word times that may no longer be where the audio is.
  if (alignment.state !== 'current' || !alignment.recordId) return refused('stale_alignment');
  if (new Set(heard.map((t) => t.item)).size > 1) return refused('spans_takes');
  const found = alignment.items.find((candidate) => candidate.index === heard[0].item);
  if (!found || !found.live || !found.takeGuid) return refused('stale_alignment');
  const first = heard[0];
  const last = heard[heard.length - 1];
  const between = alignment.tokens.filter((t) => t.p !== undefined && t.i >= first.i && t.i <= last.i).map((t) => t.text);
  return {
    ok: true,
    range: {
      chapterId: alignment.chapterId,
      itemGuid: found.itemGuid,
      takeGuid: found.takeGuid,
      sourceStart: Math.min(...heard.map((t) => t.start)),
      sourceEnd: Math.max(...heard.map((t) => t.end)),
      startKey: `${first.p}:${first.w}`,
      endKey: `${last.p}:${last.w}`,
      words: between.join(' '),
      alignmentRecordId: alignment.recordId,
    },
  };
}
