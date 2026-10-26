import { useEffect, useRef } from 'react';
import type { ExtractionScan } from './suggested/panel/useSuggestions';
import { IconButton } from '../primitives/IconButton';
import { Menu, type MenuItem } from '../primitives/Menu';

/**
 * The Story Bible's secondary actions behind one icon button: scan the manuscript, import entries, Voice data and, last, Delete Story Bible
 * data (its confirm says what goes). Add entry is the page's one
 * primary action and stays outside. While a scan runs the scan item is gone, because Cancel scan stands beside its progress (`ScanStatus`);
 * when the scan ends with focus nowhere (Cancel was the button pressed) the keyboard comes back to this button.
 */
export function ActionsMenu({
  scan,
  onImport,
  onVoiceData,
  onDeleteData,
}: {
  scan: ExtractionScan;
  onImport: () => void;
  onVoiceData: () => void;
  onDeleteData: () => void;
}) {
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
    // Opened after the menu has closed and given focus back to its button, so the confirm's focus on Cancel is not taken back.
    { key: 'delete', label: 'Delete Story Bible data…', onSelect: () => window.setTimeout(onDeleteData) },
  ];
  return (
    <span ref={slot} className="contents">
      <Menu render={<IconButton action="moreActions" label="More actions" />} items={items}>
        {null}
      </Menu>
    </span>
  );
}
