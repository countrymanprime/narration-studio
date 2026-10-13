import { useEffect, useState, type ReactNode } from 'react';
import type { Measured } from '../../../api/schemas/base';
import type { Keymap } from '../../../input/keymap';
import { footerHints } from '../../../input/hints';
import { KeyHints } from '../../primitives/KeyHints';
import { LevelsInline, LevelsMenu, type LevelsMenuProps } from './LevelsMenu';
import { timerText } from './progressLine';
import { useLevels } from './useLevels';

/** "Room −58.6 dB" (a real minus sign, one decimal), or "Room not measured yet": the mock's room tone label. */
function roomToneLabel(tone: Measured<number>): string {
  return tone.ok ? `Room ${tone.value.toFixed(1).replace('-', '−')} dB` : 'Room not measured yet';
}

/**
 * The room tone the microphone reports, from the measurements port (`roomTone(mic)`), as the footer shows it; "not measured yet"
 * until a reading comes, or when there is none.
 */
export function useRoomTone(port: { roomTone(mic: string): Promise<Measured<number>> }, mic: string): { label: string; ok: boolean } {
  const [tone, setTone] = useState<{ mic: string; answer: Measured<number> } | null>(null);
  useEffect(() => {
    let live = true;
    // A port that fails has no reading to show: its reason stands in for one.
    port
      .roomTone(mic)
      .then(
        (answer) => answer,
        (reason: unknown): Measured<number> => ({ ok: false, reason: reason instanceof Error ? reason.message : String(reason) }),
      )
      .then((answer) => live && setTone({ mic, answer }));
    return () => {
      live = false;
    };
  }, [port, mic]);
  const answer: Measured<number> = tone?.mic === mic ? tone.answer : { ok: false, reason: 'Not read yet.' };
  return { label: roomToneLabel(answer), ok: answer.ok };
}

type Mic = Pick<LevelsMenuProps, 'engine' | 'dawName' | 'reachable' | 'offReason' | 'device' | 'onDevice' | 'listen'>;

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
  keymap,
  pickupSession = false,
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
  keymap: Keymap;
  pickupSession?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // One reading for the menu and the inline meter; the capture runs only while the menu is open or a take runs.
  const { level, error } = useLevels(mic.device, { active: recording, enabled: open });
  const hints = footerHints('booth', keymap, undefined, undefined, new Set(pickupSession ? ['pickupSession' as const] : []));
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] bg-[var(--surface)] px-5 py-2.5">
        {record}
        <span id="btimer" className="font-mono text-lg text-[var(--text)]">
          {timerText(seconds)}
        </span>
        <LevelsMenu {...mic} level={level} error={error} open={open} onOpenChange={setOpen} />
        {why ? (
          <span id="brec-why" className="text-sm text-[var(--text-muted)]">
            {why}
          </span>
        ) : null}
        {listenWhy ? (
          <span id="blisten-why" role="status" className="text-sm text-[var(--warn-text)]">
            {listenWhy}
          </span>
        ) : null}
        <LevelsInline level={level} roomTone={roomTone} roomToneOk={roomToneOk} />
      </div>
      <KeyHints id="bkeys" hints={hints} />
    </div>
  );
}
