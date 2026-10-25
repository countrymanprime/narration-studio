import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Measured } from '../../../api/schemas/base';
import type { Keymap } from '../../../input/keymap';
import { footerHints } from '../../../input/hints';
import { useToastClearance } from '../../../hooks/useToastClearance';
import { Button } from '../../primitives/Button';
import { KeyHints } from '../../primitives/KeyHints';
import { LevelsInline, LevelsMenu, type LevelsMenuProps } from './LevelsMenu';
import { timerText } from './progressLine';
import { useLevels } from './useLevels';

/**
 * "Room −58.6 dB" (a real minus sign, one decimal), or "Room not measured yet": the mock's room tone label. A read that failed says
 * so ("Room tone unavailable"), so a broken host never passes for a room nothing has measured.
 */
function roomToneLabel(tone: Measured<number>, failed: boolean): string {
  if (tone.ok) return `Room ${tone.value.toFixed(1).replace('-', '−')} dB`;
  return failed ? 'Room tone unavailable' : 'Room not measured yet';
}

/** How often the footer reads the room tone again: a capture (a take, the Levels menu) keeps it about every five seconds. */
export const ROOM_TONE_READ_MS = 5_000;

/**
 * The room tone the host keeps for the microphone, from the measurements port (`roomTone(mic)`), as the footer shows it; "not
 * measured yet" until one is kept, or when there is none. Any capture of the microphone measures it, so it is read again every
 * ROOM_TONE_READ_MS and when the window regains focus, and the last answer stays on screen while the next one comes.
 */
export function useRoomTone(port: { roomTone(mic: string): Promise<Measured<number>> }, mic: string): { label: string; ok: boolean; hint?: string } {
  const [tone, setTone] = useState<{ mic: string; answer: Measured<number>; failed: boolean } | null>(null);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    const look = () => setAgain((n) => n + 1);
    window.addEventListener('focus', look);
    const timer = window.setInterval(look, ROOM_TONE_READ_MS);
    return () => {
      window.removeEventListener('focus', look);
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    let live = true;
    // A port that fails has no reading to show: its reason stands in for one, and the label says the read failed.
    port.roomTone(mic).then(
      (answer) => live && setTone({ mic, answer, failed: false }),
      (reason: unknown) => live && setTone({ mic, answer: { ok: false, reason: reason instanceof Error ? reason.message : String(reason) }, failed: true }),
    );
    return () => {
      live = false;
    };
  }, [port, mic, again]);
  const current = tone?.mic === mic ? tone : null;
  const answer: Measured<number> = current?.answer ?? { ok: false, reason: 'Not read yet.' };
  // Why there is no value and what measures one (the port's reason), as the chip's tooltip.
  const hint = !answer.ok && current ? answer.reason : undefined;
  return { label: roomToneLabel(answer, current?.failed ?? false), ok: answer.ok, ...(hint ? { hint } : {}) };
}

/** The Cold read toggle (#2251 item 13): pressed while a cold read runs; `disabledReason` while it cannot start (a take records). */
export type ColdReadToggle = { on: boolean; toggle: () => void; disabledReason?: string };

type Mic = Pick<LevelsMenuProps, 'engine' | 'dawName' | 'reachable' | 'offReason' | 'device' | 'onDevice' | 'listen' | 'levels'>;

/**
 * The Booth's footer (the mock's `bfoot`): the Record control from SN-O23 as a slot, the take timer, the Levels menu, why Record
 * is unavailable, the open meter with the room tone, and the shared key hints under them. The hints come from the catalogue
 * (`footerHints('booth', keymap)`), so Esc Exit is a reminder here and not a button on the top bar.
 */
export function BoothFooter({
  record,
  seconds,
  recording,
  why,
  listenWhy,
  mic,
  roomTone,
  roomToneOk = false,
  roomToneHint,
  keymap,
  pickupSession = false,
  coldRead,
}: {
  record: ReactNode;
  seconds: number;
  recording: boolean;
  why?: string;
  /** Why the text cannot follow the voice (no microphone, the session's error); the take itself is not affected. */
  listenWhy?: string;
  mic: Mic;
  roomTone: string;
  roomToneOk?: boolean;
  /** Why there is no room tone and what measures one, shown as the chip's tooltip. */
  roomToneHint?: string;
  keymap: Keymap;
  pickupSession?: boolean;
  /** Beside the microphone's Levels; absent, the footer has no Cold read. */
  coldRead?: ColdReadToggle;
}) {
  const [open, setOpen] = useState(false);
  // One reading for the menu and the inline meter; the capture runs only while the menu is open or a take runs.
  const { level, error } = useLevels(mic.device, { active: recording, enabled: open });
  const hints = footerHints('booth', keymap, undefined, undefined, new Set(pickupSession ? ['pickupSession' as const] : []));
  // A message rises above the whole footer, so it never covers the chips (room tone, meter) or the key hints.
  const bar = useRef<HTMLDivElement>(null);
  useToastClearance(bar);
  // One sentence at a time (alignment audit R3BO-5): why the text cannot follow the voice, in the warning colour, wins; Record's own reason
  // then stays only as its description (`aria-describedby`), not drawn beside it.
  const shownWhy = why && !listenWhy ? why : undefined;
  return (
    <div ref={bar} className="flex flex-col">
      {/*
        One row from 1024 px: the controls, the sentence in the room between (wrapping inside it), the meter at the right edge. Narrower,
        the meter stays on the controls' row and the sentence takes the full row under them, so the footer is never a stack of
        little rows with the meter alone (R4BO1-1, R4BO2-7, XBO-10).
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] bg-[var(--surface)] px-[var(--page-gutter)] py-2.5">
        <div className="flex flex-none items-center gap-4">
          {record}
          <span id="btimer" className="font-mono text-lg text-[var(--text)]">
            {timerText(seconds)}
          </span>
          <LevelsMenu {...mic} level={level} error={error} open={open} onOpenChange={setOpen} />
          {coldRead ? (
            <Button
              id="bcold"
              // Pressed, it takes the recording colour as an outline, as the microphone badge does: never Record's fill beside Record.
              variant={coldRead.on ? 'danger' : 'secondary'}
              aria-pressed={coldRead.on}
              aria-disabled={coldRead.disabledReason ? true : undefined}
              title={coldRead.disabledReason ?? (coldRead.on ? 'Stop following your voice' : 'Follow your voice without recording')}
              onClick={() => (coldRead.disabledReason ? undefined : coldRead.toggle())}
            >
              Cold read
            </Button>
          ) : null}
          {why && !shownWhy ? (
            <span id="brec-why" className="sr-only">
              {why}
            </span>
          ) : null}
        </div>
        <div className="order-2 ml-auto flex-none lg:order-3">
          <LevelsInline level={level} roomTone={roomTone} roomToneOk={roomToneOk} roomToneHint={roomToneHint} />
        </div>
        {shownWhy || listenWhy ? (
          <div className="order-3 min-w-0 basis-full text-sm lg:order-2 lg:flex-1 lg:basis-0">
            {shownWhy ? (
              <span id="brec-why" className="text-[var(--text-muted)]">
                {shownWhy}
              </span>
            ) : (
              <span id="blisten-why" role="status" className="text-[var(--warn-text)]">
                {listenWhy}
              </span>
            )}
          </div>
        ) : null}
      </div>
      <KeyHints id="bkeys" hints={hints} />
    </div>
  );
}
