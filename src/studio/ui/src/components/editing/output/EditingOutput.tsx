import { useMemo } from 'react';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { useMonitorLevel } from '../../booth/frame/useMonitorLevel';
import type { OutputPrefs } from '../../engine/outputPrefs';
import { MonitorRow, OutputControls } from './OutputControls';
import { useOutputDevices } from './useOutputDevices';

/** The DAW name when a DAW answers `monitor_level` as a capability this build can ask; null otherwise (the built-in player has no monitor of its own). */
export function monitorDaw(caps: DawCapabilities | null): string | null {
  if (!caps || caps.daw === 'none' || caps.daw === 'Built-in') return null;
  return caps.capabilities.monitor_level?.available ? caps.daw : null;
}

/** Mounted inside the popover, so the DAW is asked for its level when the narrator opens it, as the Booth's Levels menu does. */
function DawMonitorRow({ name }: { name: string }) {
  const { state, set } = useMonitorLevel();
  return <MonitorRow daw={{ name, level: state, onLevel: set }} />;
}

export interface EditingOutputProps {
  prefs: OutputPrefs;
  onChange: (patch: Partial<OutputPrefs>) => void;
  deviceProblem: string | null;
  caps: DawCapabilities | null;
}

/** The page's output controls with the computer's outputs and, with a DAW that can set it, the DAW's monitor level. */
export function EditingOutput({ prefs, onChange, deviceProblem, caps }: EditingOutputProps) {
  const { listing, refresh } = useOutputDevices();
  const daw = useMemo(() => monitorDaw(caps), [caps]);
  return (
    <OutputControls prefs={prefs} onChange={onChange} devices={listing} deviceProblem={deviceProblem} onCheckDevices={refresh}>
      {daw ? <DawMonitorRow name={daw} /> : null}
    </OutputControls>
  );
}
