import { IconButton } from '../../primitives/IconButton';
import { useVoiceTracks } from '../../engine/useVoiceTracks';
import { LayoutToggle } from '../../engine/VoicesCard';
import { useSettingsHost } from '../row/SettingsHost';

/**
 * The body of "Chapter layout": the Engine panel's Flat / Voice folders switch, on the same shared voice setup so either place shows the
 * other's change. A custom body has no Reset of its own from the page, so this one carries it, back to Flat (the layout of a new project).
 */
export function ChapterLayoutBody() {
  const { notify } = useSettingsHost();
  // Only the layout is needed here, so the Story Bible's characters are not read.
  const { setup, setLayout } = useVoiceTracks(notify, { characters: false });
  return (
    <div className="flex items-center gap-1.5">
      <LayoutToggle layout={setup.layout} onLayout={setLayout} help={false} />
      {setup.layout !== 'flat' && (
        <IconButton action="undo" label="Reset Chapter layout to Flat" className="border-transparent" onClick={() => setLayout('flat')} />
      )}
    </div>
  );
}
