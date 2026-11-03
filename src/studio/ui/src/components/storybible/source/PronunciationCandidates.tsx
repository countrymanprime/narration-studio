import { useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import type { PronunciationCandidateRow, PronunciationCandidates as Answer } from '../../../api/contracts/pronunciationSources';
import { hearNameAction } from '../../../icons.catalog';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { subscribeUserDictionaryChanged } from '../../../studio/commands/userDictionary';
import { Button } from '../../primitives/Button';
import { IconButton } from '../../primitives/IconButton';
import { StatusBadge } from '../../primitives/StatusBadge';
import { previewKey, usePreviewAudio } from '../usePreviewAudio';

/** Said when the preview voice is not installed: its install prompt lives on a Story Bible entry. */
const NEEDS_VOICE = 'The preview voice is not installed yet. Open a name in the Story Bible and press play to install it.';

export type CandidatesView = { status: 'idle' | 'loading' | 'ready' | 'error'; answer: Answer };

const NONE: Answer = { candidates: [], misses: [] };

/**
 * What every local dictionary and the narrator's own dictionary say for one word (#2595), read when `enabled` (each source is a sidecar
 * run, so a closed list asks nothing) and again after the narrator's dictionary changes. A failed read is a toast and an empty list.
 */
export function usePronunciationCandidates(word: string, enabled = true): CandidatesView {
  const port = usePort('pronunciationSources');
  const [view, setView] = useState<CandidatesView>({ status: 'idle', answer: NONE });
  const [nonce, setNonce] = useState(0);
  useEffect(() => subscribeUserDictionaryChanged(() => setNonce((n) => n + 1)), []);
  useEffect(() => {
    if (!enabled || !word.trim()) return;
    let live = true;
    setView((prior) => ({ status: 'loading', answer: prior.answer }));
    port.pronunciationCandidates(word).then(
      (answer) => live && setView({ status: 'ready', answer }),
      (error: unknown) => {
        if (!live) return;
        overlay.toast(apiErrorMessage(error), { tone: 'error' });
        setView({ status: 'error', answer: NONE });
      },
    );
    return () => {
      live = false;
    };
  }, [port, word, enabled, nonce]);
  return view;
}

/**
 * The dictionaries' candidates for one word, each with the source it came from (#2595): Hear plays the candidate before it is chosen, and
 * Use (when given) makes it the name's pronunciation. The one in use says so. The Story Bible's names row and Script's Words card both
 * draw this list, so a word reads the same on both pages.
 */
export function PronunciationCandidateList({
  word,
  candidates,
  onUse,
  inUse,
  disabled = false,
}: {
  word: string;
  candidates: readonly PronunciationCandidateRow[];
  onUse?: (candidate: PronunciationCandidateRow) => void;
  /** The value the name has now, so its row says In use instead of offering Use. */
  inUse?: string;
  disabled?: boolean;
}) {
  const port = usePort('pronunciationSources');
  const preview = usePreviewAudio({
    resetKey: word,
    requestPreview: (index) => port.pronunciationPreview(word, candidates[index ?? 0]?.say ?? ''),
    onAssetRequired: () => overlay.toast(NEEDS_VOICE),
    notify: (text, tone) => overlay.toast(text, tone ? { tone } : undefined),
  });
  return (
    <ul aria-label={`Dictionary candidates for ${word}`} className="m-0 max-h-64 list-none space-y-1.5 overflow-y-auto p-0">
      {candidates.map((candidate, index) => {
        const key = previewKey(index);
        const playing = preview.playingPreview === key;
        const used = inUse !== undefined && candidate.say === inUse;
        return (
          <li key={`${candidate.sourceId}:${candidate.say}`} className="flex flex-wrap items-center gap-2" data-source={candidate.sourceId}>
            <span className="min-w-[7rem] text-xs text-[var(--text-muted)]">{candidate.label}</span>
            <span className="min-w-0 flex-1 font-['IBM_Plex_Mono',ui-monospace,monospace] break-words">{candidate.say}</span>
            <IconButton
              action={hearNameAction(playing)}
              label={`${playing ? 'Stop' : 'Hear'} ${candidate.label}: ${candidate.say}`}
              aria-pressed={playing}
              pending={preview.loadingPreview === key}
              onClick={() => void preview.playPreview(index)}
            />
            {used ? (
              <StatusBadge tone="success" label="In use" />
            ) : (
              onUse && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  aria-label={`Use ${candidate.label}: ${candidate.say}`}
                  onClick={() => onUse(candidate)}
                >
                  Use
                </Button>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
