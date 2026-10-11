import { useEffect, type KeyboardEvent, type ReactNode } from 'react';
import { clockText } from '../../booth/boothProgress';
import { overlay } from '../../../overlay/overlayService';
import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import { Badge, toneColors, type StatusTone } from '../../primitives/StatusBadge';
import type { ChapterDoc, DocItem } from '../model';
import type { DocPara } from '../script/types';
import { useFlagActions } from './flagActions';
import { bare, HEAR_MARGIN, notScoredText } from './flagText';

/** The recogniser's score for a word, as the port gave it: a number, or null with the reason it gave none (ADR 0855). */
interface WordScore {
  conf: number | null;
  reason?: string;
}

export interface FlagCardProps {
  doc: ChapterDoc;
  /** The paragraph the card sits under. */
  dp: DocPara;
  /** The word's key, or `dup:<paragraph>` for a doubled read. */
  flag: string;
  /** The word’s score; with none given the card says it was not scored. */
  score?: WordScore;
  /** Plays the seconds from `start` to `end` of the chapter; null while there is no audio. */
  hear: ((start: number, end: number) => void) | null;
  /** Records words as read (see `useAcceptWords`). */
  accept: (keys: string[]) => void;
  onClose: () => void;
}

const NOT_YET = 'Not available yet';
const NO_AUDIO = 'There is no audio for this chapter to play.';

interface Shape {
  tone: StatusTone;
  pill: string;
  title: ReactNode;
}

function Confidence({ it, score }: { it: DocItem; score: WordScore }) {
  const heard = `heard at ${clockText(it.t0 ?? 0)}`;
  return (
    <p className="m-0 flex gap-2 text-[length:var(--font-size-sm)] text-[var(--text-muted)]">
      <span className="tracking-wide uppercase">Confidence</span>
      <span className="font-mono text-[var(--text)]">
        {score.conf === null ? `${notScoredText(score.reason)} · ${heard}` : `${Math.round(score.conf * 100)}% · ${heard}`}
      </span>
    </p>
  );
}

/**
 * What the app noticed about a word, in a card under its line: a misread (what was heard, how sure), a word not read, a word the recogniser was
 * unsure of, words said and not written, a line read twice. It suggests; the narrator decides, and looking changes nothing. A button whose
 * action a later slice supplies is disabled with “Not available yet” until that slice registers it (`flagActions`).
 */
export function FlagCard({ doc, dp, flag, score = { conf: null, reason: 'no_word_scores' }, hear, accept, onClose }: FlagCardProps) {
  const actions = useFlagActions();
  const isDup = flag.startsWith('dup:');
  const it = isDup ? undefined : dp.items.find((i) => i.key === flag);
  const kind = isDup ? 'dup' : it?.st === 'ok' ? 'low' : it?.st;

  const run = !it || it.st !== 'extra' ? [] : doc.items.filter((i) => i.pid === it.pid && i.st === 'extra' && i.run === it.run && !i.cut);
  const dupItems = dp.items.filter((i) => i.dup);

  const shape: Shape | null = (() => {
    if (isDup) return { tone: 'org', pill: 'Read twice', title: 'The line is read twice' };
    if (!it) return null;
    if (it.st === 'extra') return { tone: 'danger', pill: 'Not in the script', title: `Heard “${run.map((i) => bare(i.text)).join(' ')}”` };
    if (it.st === 'miss') return { tone: 'warning', pill: 'Not read', title: `The script has “${bare(it.text)}”, it was not heard` };
    if (it.st === 'mis') return { tone: 'warning', pill: 'Misread', title: `Heard “${bare(it.heard ?? '')}”, the script says “${bare(it.text)}”` };
    return { tone: 'info', pill: 'Low confidence', title: `The recogniser was unsure of “${bare(it.text)}”` };
  })();

  const label = shape ? `${shape.pill}. ${typeof shape.title === 'string' ? shape.title : ''}` : '';
  useEffect(() => {
    if (label) overlay.announce(label);
  }, [label]);

  if (!shape) return null;

  const keys = it?.st === 'extra' ? run.map((i) => i.key) : it ? [it.key] : [];
  const pid = dp.p.id;
  const close = (): void => {
    onClose();
    const target = flag.startsWith('dup:') ? undefined : document.querySelector<HTMLElement>(`[data-k="${CSS.escape(flag)}"]`);
    target?.focus();
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };
  const accepted = (): void => {
    accept(keys);
    onClose();
  };
  const hearIt = (): void => {
    if (!hear || !it || it.t0 == null) return;
    hear(Math.max(0, it.t0 - HEAR_MARGIN), (it.t1 ?? it.t0) + HEAR_MARGIN);
  };
  const hearReason = !hear ? NO_AUDIO : it?.t0 == null ? 'Nothing was recorded for this word.' : undefined;
  const slot = <T extends unknown[]>(fn: ((...a: T) => void) | undefined, ...args: T): (() => void) | undefined => (fn ? () => fn(...args) : undefined);

  const deleteWords = slot(actions.deleteWords, isDup ? dupItems.map((i) => i.key) : keys);
  const pickup = slot(actions.markForPickup, keys);
  const stack = slot(actions.stackAsTakes, pid);
  const gated = (fn: (() => void) | undefined, then?: () => void) => ({
    disabled: !fn,
    title: fn ? undefined : NOT_YET,
    onClick: () => {
      fn?.();
      then?.();
    },
  });

  return (
    <div
      role="note"
      data-flagcard={kind}
      onKeyDown={onKeyDown}
      className="my-1 ml-[82px] flex max-w-[1000px] flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text)]"
    >
      <div className="flex flex-nowrap items-center gap-2">
        <Badge label={shape.pill} colors={toneColors(shape.tone)} />
        <b>{shape.title}</b>
      </div>
      {isDup ? (
        <p className="m-0 text-[var(--text-muted)]">
          {dp.take?.id ?? 'The take'} reads the line twice. The second read starts at {clockText(dupItems[0]?.t0 ?? 0)}.
        </p>
      ) : null}
      {it && it.st !== 'miss' ? <Confidence it={it} score={score} /> : null}
      <div className="flex flex-wrap gap-2">
        {isDup ? (
          <>
            <Button size="sm" {...gated(stack)}>
              Stack as 2 takes
            </Button>
            <Button size="sm" variant="secondary" onClick={close}>
              Leave in place
            </Button>
            <Button size="sm" variant="ghost" {...gated(deleteWords)}>
              Delete second read…
            </Button>
          </>
        ) : (
          <>
            {it?.st !== 'miss' ? (
              <Button size="sm" variant="secondary" disabled={!!hearReason} title={hearReason} onClick={hearIt}>
                <Icon name="play" /> {it?.st === 'extra' ? 'Hear it' : 'Hear the word'}
              </Button>
            ) : null}
            {it?.st === 'extra' ? (
              <>
                <Button size="sm" variant="secondary" onClick={accepted}>
                  Keep this addition
                </Button>
                <Button size="sm" variant="danger" {...gated(deleteWords)}>
                  Delete words and audio…
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={accepted}>
                  It is right, accept
                </Button>
                <Button size="sm" {...gated(pickup, onClose)}>
                  Mark for pickup
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
