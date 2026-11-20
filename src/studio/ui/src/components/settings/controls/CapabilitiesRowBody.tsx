import { plural } from '../../../plural';
import { useDawCapabilityReport } from '../../../daw/useDawCapabilityReport';
import { availableCount, toolName } from '../../engine/CapabilityReferenceDialog';
import { CapabilityReferenceButton } from '../../engine/CapabilityReferenceButton';

/**
 * The Capabilities row: one line saying how much of what the app asks of a recording tool the linked one does now, and the button that opens
 * the whole list (the same dialog as the audio engine panel's). The list is a reference, so it is not drawn inside a row of settings.
 */
export function CapabilitiesRowBody() {
  const { report, loadError } = useDawCapabilityReport();
  const { available, total } = availableCount(report);
  const summary = report
    ? report.daw === 'none'
      ? 'No recording tool is linked.'
      : `${toolName(report)} does ${available} of ${plural(total, 'thing')} the app asks of it now.`
    : loadError
      ? 'Could not be read.'
      : 'Reading what the recording tool can do…';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[0.875rem]">{summary}</span>
      <CapabilityReferenceButton size="md">See what each tool can do</CapabilityReferenceButton>
    </div>
  );
}
