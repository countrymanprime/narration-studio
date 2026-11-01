import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faCopy, faFileLines, faMinus, faPlus, faThumbtack, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { ManuscriptChapter, PinnedPreview, PreviewCandidate, PreviewResult } from '../../types';
import { chapterName } from '../../chapterName';
import { describeApiError } from '../../api/errorMessage';
import { useApi } from '../../api/ApiContext';
import { describeParagraphs, formatAudioTime, paragraphRefs } from '../production/recordingCheckText';
import { Button } from '../primitives/Button';
import { InsetCard } from '../primitives/InsetCard';
import { LoadingRegion, Skeleton } from '../primitives/Skeleton';
import { Panel } from '../primitives/Panel';
import { IconButton } from '../primitives/IconButton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../primitives/Table';
import { TooltipTarget } from '../primitives/Tooltip';
import type { Notify } from '../primitives/Toast';
import { ProofOptions } from './proofOptions/ProofOptions';

type Phase = 'loading' | 'ready' | 'error';

/** The host's Preview settings (`fieldSchemas` in src/studio/desktop/app.go): how long an excerpt is and which kind the page suggests. */
/** Fixed columns for the figures, Why suggested 30% and the chapter's name the rest, so a long name has the room; the actions end at the
 * table's edge (alignment audit XPC-2, XPC-4). */
const PREVIEW_COLUMNS = ['auto', '5.5rem', '4.5rem', '4.5rem', '30%', '7.5rem'] as const;

/** The range in the Paragraphs column, under its own header: "1–24", or "3, 5 and 9" for one with gaps (R3PC-12). */
function paragraphSpan(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  if (sorted.length === 0) return '—';
  const consecutive = sorted.every((value, index) => index === 0 || value === sorted[index - 1] + 1);
  if (sorted.length === 1) return String(sorted[0]);
  if (consecutive) return `${sorted[0]}–${sorted[sorted.length - 1]}`;
  return `${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`;
}

/** The panel's sentence when it has no candidates to list: an icon, the sentence and the way forward when there is one. */
function EmptyLine({ icon, tone, action, children }: { icon: IconDefinition; tone?: 'danger'; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: tone === 'danger' ? 'var(--danger-text)' : 'var(--text-muted)' }}>
      <FontAwesomeIcon icon={icon} aria-hidden="true" className="flex-none" />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

const PREVIEW_KEYS = ['target_seconds', 'tolerance_fraction', 'preset', 'exclude_ending_fraction'] as const;

/**
 * The Proofing page's preview suggestion: up to three candidate
 * five-minute excerpts, computed fresh on every read (SR D1 - nothing here is applied, exported or stored; opening a
 * candidate in the reader or copying its range starts nothing either).
 */
export function PreviewPanel({ notify, goToManuscript }: { notify: Notify; goToManuscript: (chapter: string, paragraph: number) => void }) {
  const api = useApi();
  const [phase, setPhase] = useState<Phase>('loading');
  const [result, setResult] = useState<PreviewResult>();
  const [chapters, setChapters] = useState<ManuscriptChapter[]>([]);
  const [error, setError] = useState('');
  const [copiedChapterId, setCopiedChapterId] = useState<string>();
  const [pinned, setPinned] = useState<PinnedPreview>();
  const [pinBusy, setPinBusy] = useState(false);
  // Bumped when a preview option is saved: the candidates are computed fresh from the settings on every read.
  const [reads, setReads] = useState(0);
  const readAgain = useCallback(() => setReads((n) => n + 1), []);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setPhase('loading');
    Promise.all([api.previewCandidates(), api.manuscriptChapters(), api.previewPin()])
      .then(([preview, loadedChapters, pin]) => {
        if (!active) return;
        setResult(preview);
        setChapters(loadedChapters);
        setPinned(pin);
        setPhase('ready');
      })
      .catch((err) => {
        if (!active) return;
        setError(describeApiError(err));
        setPhase('error');
      });
    return () => {
      active = false;
    };
  }, [api, reads]);

  // Every pin action (User Flow step 5) re-reads the pin the binding itself just resolved, rather than guessing the
  // new state locally: the host recomputes evidence and staleness fresh on every call (SR D1), so this is the one
  // source of truth after a set, adjust or clear.
  const runPinAction = useCallback(
    (action: () => Promise<PinnedPreview>) => {
      setPinBusy(true);
      action()
        .then(setPinned)
        .catch((err: unknown) => notify(describeApiError(err), 'error'))
        .finally(() => setPinBusy(false));
    },
    [notify],
  );

  const pinCandidate = (candidate: PreviewCandidate) => runPinAction(() => api.previewPinSet(candidate.chapterId, candidate.paragraphIds));
  const clearPin = () => runPinAction(() => api.previewPinClear());
  const adjustPin = (edge: 'start' | 'end', grow: boolean) => runPinAction(() => api.previewPinAdjust(edge, grow));

  const isPinned = (candidate: PreviewCandidate): boolean =>
    pinned?.present === true &&
    pinned.candidate?.chapterId === candidate.chapterId &&
    pinned.candidate.paragraphIds.length === candidate.paragraphIds.length &&
    pinned.candidate.paragraphIds.every((id, index) => id === candidate.paragraphIds[index]);

  // The "Copied" confirmation reverts itself after a couple of seconds (the usual flash-then-clear
  // pattern), a fresh timer per copy so two quick copies of different candidates each get their own window.
  useEffect(() => {
    if (!copiedChapterId) return;
    const clear = window.setTimeout(() => setCopiedChapterId(undefined), 2000);
    return () => window.clearTimeout(clear);
  }, [copiedChapterId]);

  const chapterOf = (candidate: PreviewCandidate): ManuscriptChapter | undefined => chapters.find((item) => item.id === candidate.chapterId);
  // The candidate's own chapterTitle (a plain string on the wire) is the fallback when the chapter list hasn't
  // loaded yet or no longer has the chapter; chapterName still squashes it the same way.
  const nameOf = (candidate: PreviewCandidate, form: 'full' | 'short' = 'full') => chapterName(chapterOf(candidate) ?? { title: candidate.chapterTitle }, form);

  const paragraphNumbers = (candidate: PreviewCandidate): number[] => {
    const chapter = chapterOf(candidate);
    return chapter ? paragraphRefs(chapter, candidate.paragraphIds).map((ref) => ref.number) : [];
  };

  const firstParagraphIndex = (candidate: PreviewCandidate): number | undefined => {
    const chapter = chapterOf(candidate);
    if (!chapter || candidate.paragraphIds.length === 0) return undefined;
    return paragraphRefs(chapter, candidate.paragraphIds.slice(0, 1))[0]?.index;
  };

  const copyRange = (candidate: PreviewCandidate) => {
    const text = `${nameOf(candidate, 'short')}, ${describeParagraphs(paragraphNumbers(candidate))} (${formatAudioTime(candidate.estimatedSeconds)})`;
    void navigator.clipboard?.writeText(text).then(
      () => setCopiedChapterId(candidate.chapterId),
      (err) => notify(describeApiError(err), 'error'),
    );
  };

  // A reason every candidate gives (each starts and ends on paragraph boundaries) is said once, not in every row.
  const candidates = result?.outcome === 'ok' ? result.candidates : [];
  const shared = candidates.length > 1 ? candidates[0].reasons.filter((reason) => candidates.every((candidate) => candidate.reasons.includes(reason))) : [];

  return (
    <Panel title="Preview">
      {/* One shape for every state without candidates: an icon, the sentence and, where there is one, the way forward (R3PC-1). */}
      {phase === 'loading' && (
        <LoadingRegion label="Preview suggestions" status="Computing suggestions…" className="flex flex-col gap-2">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Computing suggestions…
          </p>
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </LoadingRegion>
      )}
      {phase === 'error' && (
        <EmptyLine
          icon={faTriangleExclamation}
          tone="danger"
          action={
            <Button variant="secondary" onClick={readAgain}>
              Retry
            </Button>
          }
        >
          <span role="alert">Couldn’t read preview suggestions: {error}</span>
        </EmptyLine>
      )}
      {phase === 'ready' && result?.outcome === 'no_manuscript' && (
        <EmptyLine
          icon={faFileLines}
          action={
            <Button variant="secondary" onClick={() => navigate('/')}>
              Open Production
            </Button>
          }
        >
          Import a manuscript to see preview suggestions.
        </EmptyLine>
      )}
      {phase === 'ready' && result?.outcome === 'nothing_eligible' && (
        <EmptyLine icon={faFileLines}>No eligible text was found for a preview. Narration chapters with at least one paragraph are needed.</EmptyLine>
      )}
      {phase === 'ready' && result?.outcome === 'ok' && (
        // The table runs to the card's edges, its text 16 px in where the title starts (XPC-3), in fixed columns that stay put between
        // states (XPC-2, XPC-4); in a narrow window it scrolls sideways and shows it (XPC-20). `-mx-4` spans the Panel body's 1rem padding; inside,
        // `--panel-pad: 0` gives the outer cells their 16 px.
        <>
          <div className="scroll-x-edges -mx-4 [scrollbar-gutter:auto] overflow-x-auto [--panel-pad:0px]">
            <Table label="Preview candidates" columns={PREVIEW_COLUMNS} className="min-w-[44rem]">
              <TableHead>
                <TableRow>
                  <TableHeader>Chapter</TableHeader>
                  <TableHeader>Paragraphs</TableHeader>
                  <TableHeader>Length</TableHeader>
                  <TableHeader>Words</TableHeader>
                  <TableHeader>Why suggested</TableHeader>
                  <TableHeader hiddenLabel="Actions" />
                </TableRow>
              </TableHead>
              <TableBody>
                {result.candidates.map((candidate) => {
                  const copied = copiedChapterId === candidate.chapterId;
                  const isThisPinned = isPinned(candidate);
                  return [
                    <TableRow key={candidate.chapterId} className={candidate.warnings.length > 0 ? '[&>td]:border-b-0' : ''}>
                      <TableCell className="font-medium">{nameOf(candidate)}</TableCell>
                      <TableCell numeric align="left">
                        {paragraphSpan(paragraphNumbers(candidate))}
                      </TableCell>
                      <TableCell numeric>{formatAudioTime(candidate.estimatedSeconds)}</TableCell>
                      <TableCell numeric>{candidate.wordCount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">
                        {/* Only what sets this range apart: a reason every candidate shares is said once under the table (R3PC-12). */}
                        <ul className="space-y-1">
                          {candidate.reasons
                            .filter((reason) => !shared.includes(reason))
                            .map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                        </ul>
                      </TableCell>
                      <TableCell>
                        {/* At the table's right edge, 32 px, so the three read as this row's and not a keypad (XPC-2, R3PC-2). */}
                        <div className="flex items-center justify-end gap-1.5">
                          <TooltipTarget text={`Open ${nameOf(candidate, 'short')} in the manuscript reader`}>
                            <IconButton
                              size="sm"
                              label={`Open ${nameOf(candidate, 'short')} in the manuscript reader`}
                              onClick={() => goToManuscript(candidate.chapterId, firstParagraphIndex(candidate) ?? 0)}
                            >
                              <FontAwesomeIcon icon={faFileLines} />
                            </IconButton>
                          </TooltipTarget>
                          <TooltipTarget text={copied ? 'Copied' : `Copy range and length for ${nameOf(candidate, 'short')}`}>
                            <IconButton
                              size="sm"
                              label={copied ? 'Copied' : `Copy range and length for ${nameOf(candidate, 'short')}`}
                              onClick={() => copyRange(candidate)}
                            >
                              <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                            </IconButton>
                          </TooltipTarget>
                          <TooltipTarget text={isThisPinned ? `Unpin ${candidate.chapterTitle}` : `Pin ${candidate.chapterTitle} as the preview to keep`}>
                            <IconButton
                              size="sm"
                              label={isThisPinned ? `Unpin ${candidate.chapterTitle}` : `Pin ${candidate.chapterTitle} as the preview to keep`}
                              variant={isThisPinned ? 'primary' : 'default'}
                              disabledReason={pinBusy ? 'A pin action is already in progress.' : undefined}
                              onClick={() => (isThisPinned ? clearPin() : pinCandidate(candidate))}
                            >
                              <FontAwesomeIcon icon={faThumbtack} />
                            </IconButton>
                          </TooltipTarget>
                        </div>
                      </TableCell>
                    </TableRow>,
                    // A warning is its own full-width line under its chapter, not glued to the reasons (R4PC-3).
                    candidate.warnings.length > 0 && (
                      <TableRow key={`${candidate.chapterId}-warnings`}>
                        <TableCell colSpan={6} className="text-xs">
                          <ul className="space-y-1">
                            {candidate.warnings.map((warning) => (
                              <li key={warning} className="flex items-start gap-1.5" style={{ color: 'var(--warn-text)' }}>
                                <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" className="mt-0.5 flex-none" />
                                <span>{warning}</span>
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    ),
                  ];
                })}
              </TableBody>
            </Table>
          </div>
          {shared.length > 0 && (
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Every suggestion: {shared.join(' ')}
            </p>
          )}
        </>
      )}
      {pinned?.present && (
        // Its controls at 32 px, so the heading row and the Start / End steppers are as dense as the table rows above (XPC-22).
        <InsetCard className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Pinned preview</h3>
            <TooltipTarget text="Clear the pinned preview">
              <IconButton
                size="sm"
                label="Clear the pinned preview"
                disabledReason={pinBusy ? 'A pin action is already in progress.' : undefined}
                onClick={clearPin}
              >
                <FontAwesomeIcon icon={faXmark} />
              </IconButton>
            </TooltipTarget>
          </div>
          {pinned.stale && (
            <p role="status" className="mt-1 flex items-start gap-1 text-sm" style={{ color: 'var(--warn-text)' }}>
              <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" className="mt-0.5 flex-none" />
              <span>
                {pinned.staleReason === 'paragraph_missing'
                  ? 'This pinned range is no longer in the manuscript (a re-import likely changed the paragraphs). Clear it and pin a new one.'
                  : 'The manuscript text under this pin has changed since it was pinned or last adjusted.'}
              </span>
            </p>
          )}
          {pinned.candidate && (
            <>
              <p className="mt-1 text-sm">
                {pinned.candidate.chapterTitle}, {describeParagraphs(paragraphNumbers(pinned.candidate))} ({formatAudioTime(pinned.candidate.estimatedSeconds)})
              </p>
              <ul className="mt-1 space-y-1 text-xs">
                {pinned.candidate.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
                {pinned.candidate.warnings.map((warning) => (
                  <li key={warning} className="flex items-start gap-1" style={{ color: 'var(--warn-text)' }}>
                    <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" className="mt-0.5 flex-none" />
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  Start:
                  <TooltipTarget text="Extend the start by one paragraph">
                    <IconButton
                      size="sm"
                      label="Extend the start by one paragraph"
                      disabledReason={
                        !pinned.canExtendStart ? 'Already at the start of the chapter.' : pinBusy ? 'A pin action is already in progress.' : undefined
                      }
                      onClick={() => adjustPin('start', true)}
                    >
                      <FontAwesomeIcon icon={faPlus} />
                    </IconButton>
                  </TooltipTarget>
                  <TooltipTarget text="Shrink the start by one paragraph">
                    <IconButton
                      size="sm"
                      label="Shrink the start by one paragraph"
                      disabledReason={
                        !pinned.canShrinkStart ? 'This range is already one paragraph.' : pinBusy ? 'A pin action is already in progress.' : undefined
                      }
                      onClick={() => adjustPin('start', false)}
                    >
                      <FontAwesomeIcon icon={faMinus} />
                    </IconButton>
                  </TooltipTarget>
                </span>
                <span className="flex items-center gap-1">
                  End:
                  <TooltipTarget text="Extend the end by one paragraph">
                    <IconButton
                      size="sm"
                      label="Extend the end by one paragraph"
                      disabledReason={
                        !pinned.canExtendEnd ? 'Already at the end of the chapter.' : pinBusy ? 'A pin action is already in progress.' : undefined
                      }
                      onClick={() => adjustPin('end', true)}
                    >
                      <FontAwesomeIcon icon={faPlus} />
                    </IconButton>
                  </TooltipTarget>
                  <TooltipTarget text="Shrink the end by one paragraph">
                    <IconButton
                      size="sm"
                      label="Shrink the end by one paragraph"
                      disabledReason={
                        !pinned.canShrinkEnd ? 'This range is already one paragraph.' : pinBusy ? 'A pin action is already in progress.' : undefined
                      }
                      onClick={() => adjustPin('end', false)}
                    >
                      <FontAwesomeIcon icon={faMinus} />
                    </IconButton>
                  </TooltipTarget>
                </span>
              </div>
            </>
          )}
        </InsetCard>
      )}
      <ProofOptions title="Preview options" group="Proof" tool="Preview" keys={PREVIEW_KEYS} onSaved={readAgain} />
    </Panel>
  );
}
