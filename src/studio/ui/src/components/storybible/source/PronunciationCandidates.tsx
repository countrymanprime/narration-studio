import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { USER_DICTIONARY_SOURCE, type PronunciationCandidateRow, type PronunciationCandidates as Answer } from '../../../api/contracts/pronunciationSources';
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

/** The read's state and answer; `retry` asks every source again (the Check again of a failed read). */
export type CandidatesView = { status: 'idle' | 'loading' | 'ready' | 'error'; answer: Answer; retry: () => void };

const NONE: Answer = { candidates: [], misses: [] };

/**
 * What every local dictionary and the narrator's own dictionary say for one word (#2595), read when `enabled` (each source is a sidecar
 * run, so a closed list asks nothing) and again after the narrator's dictionary changes. A failed read is a toast, and `retry` reads again.
 */
export function usePronunciationCandidates(word: string, enabled = true): CandidatesView {
  const port = usePort('pronunciationSources');
  const [view, setView] = useState<Omit<CandidatesView, 'retry'>>({ status: 'idle', answer: NONE });
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
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { ...view, retry };
}

/** Said in place of the list when the read failed (the toast said why): Check again reads every source again. */
export function CandidatesCheckAgain({ view }: { view: CandidatesView }) {
  return (
    <Button variant="secondary" size="sm" onClick={view.retry}>
      Check again
    </Button>
  );
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
  onRemove,
  inUse,
  disabled = false,
}: {
  word: string;
  candidates: readonly PronunciationCandidateRow[];
  onUse?: (candidate: PronunciationCandidateRow) => void;
  /** Removes one of the narrator's own records (My dictionary), so a value they saved can be corrected. */
  onRemove?: (candidate: PronunciationCandidateRow) => void;
  /** The value the name has now and its source, so that one row says In use instead of offering Use. */
  inUse?: { say: string; source: string };
  disabled?: boolean;
}) {
  const port = usePort('pronunciationSources');
  const preview = usePreviewAudio({
    resetKey: word,
    requestPreview: (index) => port.pronunciationPreview(word, candidates[index ?? 0]?.say ?? ''),
    onAssetRequired: () => overlay.toast(NEEDS_VOICE),
    notify: (text, tone) => overlay.toast(text, tone ? { tone } : undefined),
  });
  // A word has a few candidates, so the list scrolls only for a word with many of the narrator's records: it takes room for the bar only
  // then (gutter auto, not the stable gutter of styles.css), and its Use buttons end where the names row's controls end (alignment A4).
  return (
    <ul aria-label={`Dictionary candidates for ${word}`} className="m-0 max-h-64 [scrollbar-gutter:auto] list-none space-y-1.5 overflow-y-auto p-0">
      {candidates.map((candidate, index) => {
        const key = previewKey(index);
        const playing = preview.playingPreview === key;
        const used = inUse !== undefined && candidate.say === inUse.say && candidate.sourceId === inUse.source;
        return (
          <li key={`${candidate.sourceId}:${candidate.say}`} data-source={candidate.sourceId}>
            {/* The source on its own line and the value beside its controls: in the Script rail and at 390 px a value keeps the width
                and wraps whole, and the controls stay on its line (walkthrough #2595). */}
            <div className="text-xs text-[var(--text-muted)]">{candidate.label}</div>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 font-['IBM_Plex_Mono',ui-monospace,monospace] [overflow-wrap:anywhere]">{candidate.say}</span>
              <span className="flex flex-none items-center gap-2">
                <IconButton
                  action={hearNameAction(playing)}
                  label={`${playing ? 'Stop' : 'Hear'} ${candidate.label}: ${candidate.say}`}
                  aria-pressed={playing}
                  pending={preview.loadingPreview === key}
                  onClick={() => void preview.playPreview(index)}
                />
                {onRemove && candidate.sourceId === USER_DICTIONARY_SOURCE && (
                  <IconButton action="remove" label={`Remove ${candidate.say} from my dictionary`} disabled={disabled} onClick={() => onRemove(candidate)} />
                )}
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
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
