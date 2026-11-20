import { useState } from 'react';
import { useDawCapabilityReport } from '../../daw/useDawCapabilityReport';
import { Button } from '../primitives/Button';
import { Dialog } from '../primitives/Dialog';
import { IconButton } from '../primitives/IconButton';
import { CapabilityReference } from './CapabilityReferenceDialog';

/**
 * The one way to the capability reference: a button that opens it in a dialog. The audio engine panel and the Settings row both draw this,
 * so there is one report (the DAW session's) and one table. With `children` it is a text button; without, an icon button with a tooltip.
 */
export function CapabilityReferenceButton({ children, size = 'md' }: { children?: string; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  const { report, loadError, retry } = useDawCapabilityReport();
  return (
    <>
      {children ? (
        <Button variant="secondary" size={size} onClick={() => setOpen(true)}>
          {children}
        </Button>
      ) : (
        <IconButton action="capabilities" onClick={() => setOpen(true)} />
      )}
      {open && (
        <Dialog
          title="What each tool can do"
          size="wide"
          dismissOnOutsidePress
          onClose={() => setOpen(false)}
          actions={
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          }
        >
          <CapabilityReference report={report} loadError={loadError} onRetry={retry} />
        </Dialog>
      )}
    </>
  );
}
