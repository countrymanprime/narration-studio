import { useEffect, useRef } from 'react';
import type { ExtractionScan } from './suggested/panel/useSuggestions';
import { IconButton } from '../primitives/IconButton';
import { Menu, type MenuItem } from '../primitives/Menu';

/**
 * The Story Bible's secondary actions behind one icon button: scan the manuscript, import entries and Voice data. Add entry is the page's one
 * primary action and stays outside. While a scan runs the scan item is gone, because Cancel scan stands beside its progress (`ScanStatus`);
 * when the scan ends with focus nowhere (Cancel was the button pressed) the keyboard comes back to this button.
 */
export function ActionsMenu({ scan, onImport, onVoiceData }: { scan: ExtractionScan; onImport: () => void; onVoiceData: () => void }) {
  const slot = useRef<HTMLSpanElement>(null);
  const wasRunning = useRef(scan.running);
  useEffect(() => {
    if (scan.running === wasRunning.current) return;
    wasRunning.current = scan.running;
    if (scan.running || (document.activeElement && document.activeElement !== document.body)) return;
    slot.current?.querySelector('button')?.focus();
  }, [scan.running]);
  const items: MenuItem[] = [
    ...(scan.running ? [] : [{ key: 'scan', label: 'Scan the manuscript', onSelect: () => void scan.start() }]),
    { key: 'import', label: 'Import entries', onSelect: onImport },
    { key: 'voice', label: 'Voice data', onSelect: onVoiceData },
  ];
  return (
    <span ref={slot} className="contents">
      <Menu render={<IconButton action="moreActions" label="More actions" />} items={items}>
        {null}
      </Menu>
    </span>
  );
}
