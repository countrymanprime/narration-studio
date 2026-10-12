import { IconButton } from '../../../primitives/IconButton';

/** The Story Bible header's import button. It only asks the page to open the import dialog (SN-X522's); it imports nothing itself. */
export function ImportButton({ onImport }: { onImport: () => void }) {
  return <IconButton action="import" label="Import entries (CSV or JSON)" aria-haspopup="dialog" onClick={onImport} />;
}
