import { useState, type ReactNode } from 'react';
import type { Keymap } from '../../../input/keymap';
import { footerHints } from '../../../input/hints';
import { KeyHints } from '../../primitives/KeyHints';
import { LevelsInline, LevelsMenu, type LevelsMenuProps } from './LevelsMenu';
import { timerText } from './progressLine';
import { useLevels } from './useLevels';

type Mic = Pick<LevelsMenuProps, 'engine' | 'dawName' | 'reachable' | 'offReason' | 'device' | 'onDevice'>;

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
        <LevelsInline level={level} roomTone={roomTone} roomToneOk={roomToneOk} />
      </div>
      <KeyHints id="bkeys" hints={hints} />
    </div>
  );
}
