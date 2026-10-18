import { IconButton } from '../primitives/IconButton';
import { Icon } from '../primitives/Icon';
import { ProgressBar } from '../primitives/ProgressBar';
import type { SamplePlayerStatus } from './samplePlayerStore';

/** "7 seconds", "1 second", "0.5 seconds": a length for a button's name, as the narrator would say it. */
export function spokenLength(durationMs: number): string {
  const seconds = Math.round(durationMs / 100) / 10;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} ${seconds === 1 ? 'second' : 'seconds'}`;
}

/**
 * The play control of one voice sample, from props only (docs/prds/character-voice-samples.prd.md, Keyboard and accessibility): an
 * `IconButton` named "Play voice sample: angry, to the Duke, 7 seconds", and "Stop" while it loads or plays. While it is active a thin bar
 * shows the real progress (`currentTime` over `duration`), with no animation, so reduced motion needs no case. It has no shortcut of its
 * own: Space stays Record in the Booth, and the keys are the pages' (phases 3 to 5). A refusal (`disabledReason`) keeps it focusable, and
 * the reason is its hint.
 */
export function SamplePlayButton({
  label,
  durationMs,
  status,
  progress,
  disabledReason,
  onPlay,
  onStop,
}: {
  /** The sample's label, or the character's name when it has none. */
  label: string;
  durationMs: number;
  status: SamplePlayerStatus;
  /** 0 to 1; read only while `status` is not idle. */
  progress: number;
  disabledReason?: string;
  onPlay: () => void;
  onStop: () => void;
}) {
  const active = status !== 'idle';
  return (
    <span className="inline-flex flex-col items-stretch gap-1">
      <IconButton
        label={active ? 'Stop' : `Play voice sample: ${label}, ${spokenLength(durationMs)}`}
        aria-pressed={active}
        disabledReason={active ? undefined : disabledReason}
        onClick={active ? onStop : onPlay}
      >
        <Icon name={active ? 'stop' : 'play'} />
      </IconButton>
      {active ? (
        <ProgressBar label={`Voice sample: ${label}`} value={Math.round(progress * 100)} size="thin" valueText={`${Math.round(progress * 100)}% played`} />
      ) : null}
    </span>
  );
}

/**
 * The polite live region for the one shared player (no `status` role, so a page's own `status` queries and notices are not joined by an empty one): "Playing voice sample for Hatter", "Voice sample finished". A page mounts it once, next
 * to its `useSamplePlayer`, so several play controls do not announce the same sample several times.
 */
export function SamplePlayerAnnouncement({ text }: { text: string }) {
  return (
    <p aria-live="polite" className="sr-only" data-sample-announcement>
      {text}
    </p>
  );
}
