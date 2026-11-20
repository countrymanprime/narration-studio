import { useState } from 'react';
import { useDawCapabilityReport } from '../../daw/useDawCapabilityReport';
import { Button } from '../primitives/Button';
import { Dialog } from '../primitives/Dialog';
import { CapabilityReference, toolName } from './CapabilityReferenceDialog';

/**
 * The one way to the capability reference: a button that opens it in a dialog. The audio engine panel and the Settings row both draw this,
 * so there is one report (the DAW session's) and one table. `children` is the button's text.
 */
export function CapabilityReferenceButton({ children = 'What it can do', size = 'sm' }: { children?: string; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  const { report, loadError, retry } = useDawCapabilityReport();
  return (
    <>
      <Button variant="secondary" size={size} onClick={() => setOpen(true)}>
        {children}
      </Button>
      {open && (
        <Dialog
          title={`What ${toolName(report)} can do`}
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
