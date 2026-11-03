import { useVoiceTracks } from '../../engine/useVoiceTracks';
import { LayoutToggle } from '../../engine/VoicesCard';
import { useSettingsHost } from '../row/SettingsHost';

/** The body of "Chapter layout": the Engine panel's Flat / Voice folders switch, on the same shared voice setup so either place shows the other's change. */
export function ChapterLayoutBody() {
  const { notify } = useSettingsHost();
  const { setup, setLayout } = useVoiceTracks(notify);
  return <LayoutToggle layout={setup.layout} onLayout={setLayout} help={false} />;
}
