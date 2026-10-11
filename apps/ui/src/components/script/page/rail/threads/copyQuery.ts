import type { Mark } from '../../../../../api/contracts/marks';
import { overlay } from '../../../../../overlay/overlayService';

/** What goes to the author: the passage's place and words, then the question. */
const queryText = (line: string, mark: Pick<Mark, 'quote' | 'text'>): string => `${line}: “${mark.quote}”\n${mark.text}`;

/** Puts a query on the clipboard and says so; a clipboard that refuses says that instead. */
export async function copyQuery(line: string, mark: Pick<Mark, 'quote' | 'text'>): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(queryText(line, mark));
    overlay.toast('Query copied.');
    return true;
  } catch {
    overlay.toast('Could not copy to the clipboard.', { tone: 'error' });
    return false;
  }
}
