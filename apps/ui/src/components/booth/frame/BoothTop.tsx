import type { ReactNode } from 'react';
import { useLayoutClass } from '../../../hooks/useLayoutClass';
import { IconButton } from '../../primitives/IconButton';
import { Popover } from '../../primitives/Popover';
import { Select } from '../../primitives/Select';
import { Slider } from '../../primitives/Slider';
import { Badge } from '../../primitives/StatusBadge';
import { READER_FONTS } from '../../script/page/tools/text/readerText';
import { TEXT_SIZE } from '../reading/BoothText';

/** At the reported width 1280 and below the side panel is a drawer, not a column (the layout class's `medium`). */
function useSidePanelDrawer(): boolean {
  return useLayoutClass().medium;
}

const FONT_OPTIONS = READER_FONTS.map(([name]) => ({ value: name, label: name }));

/** The text choices the popover shows and changes: the reader font and the Booth's own size. */
export type BoothTextChoice = { font: string; size: number; onFont: (font: string) => void; onSize: (size: number) => void };

// The mock's `TextPop`: the reader font (the choice the Script's text settings write too) and the Booth size, 24 to 72 px in steps of 4.
function TextPopover({ font, size, onFont, onSize }: BoothTextChoice) {
  return (
    <Popover trigger={<IconButton action="textSettings" label="Text settings" />} label="Text settings">
      <div className="flex min-w-[280px] flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-[var(--text-muted)]">Font</span>
          <Select label="Font" value={font} onChange={onFont} options={FONT_OPTIONS} fullWidth />
        </div>
        <Slider label="Size" valueText={`${size} px`} min={TEXT_SIZE.min} max={TEXT_SIZE.max} step={TEXT_SIZE.step} value={size} onValueChange={onSize} />
      </div>
    </Popover>
  );
}

// The REC tokens (ADR 0656).
const REC_COLORS = { fill: 'var(--rec-fill)', text: 'var(--rec-text)', line: 'var(--rec-text)' };

/**
 * The Booth's top bar (the mock's `BoothTop`): the chapter bar and the progress line, the resume offer and the recording-setup
 * chip as slots (SN-O51, SN-O23), the REC pill only while a take runs, the text popover and the side-panel toggle. There is no Ready chip and
 * no exit button: Esc Exit is a reminder in the footer.
 */
export function BoothTop({
  chapter,
  progress,
  resume,
  setup,
  recording,
  paused = false,
  panelOpen,
  onTogglePanel,
  panelId,
  pickupsOpen,
  text,
}: {
  chapter?: ReactNode;
  progress: string;
  resume?: ReactNode;
  setup?: ReactNode;
  recording: boolean;
  paused?: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  /** The id of the side panel this button opens; absent while no panel is mounted, so the button names nothing it does not control. */
  panelId?: string;
  /** Open pickups, in a pickup session; null or absent outside one. */
  pickupsOpen?: number | null;
  /** The text popover's choices; absent, the bar has no text button. */
  text?: BoothTextChoice;
}) {
  const drawer = useSidePanelDrawer();
  return (
    <div className="flex h-13 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5">
      {chapter}
      {pickupsOpen != null ? (
        <Badge
          shape="booth"
          label={`Pickups · ${pickupsOpen} open`}
          colors={{ fill: 'var(--surface-2, var(--surface))', text: 'var(--text)', line: 'var(--border)' }}
          look="outline"
        />
      ) : null}
      <span id="bprog" className="font-mono text-sm text-[var(--text-muted)]">
        {progress}
      </span>
      {resume}
      <span className="flex-1" />
      {recording ? <Badge shape="booth" label={paused ? 'REC paused' : 'REC'} colors={REC_COLORS} /> : null}
      {setup}
      {text ? <TextPopover {...text} /> : null}
      <IconButton
        action="sidePanel"
        id="brailbtn"
        aria-expanded={panelOpen}
        aria-controls={panelId}
        data-panel={drawer ? 'drawer' : 'column'}
        onClick={onTogglePanel}
      />
    </div>
  );
}
