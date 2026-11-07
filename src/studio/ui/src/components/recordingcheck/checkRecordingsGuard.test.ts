import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #2833: Check recordings is one button over one gate and one dialog. Only `CheckRecordingsButton.tsx` draws the `checkRecordings` icon or a Check
 * recordings text button, and no page words its own label for it. A page command, a context-menu entry and the Editing page's own command cannot
 * render the button, so they call `openCheckRecordings` themselves, with the shared label and gate; that short list is exact, so a page that adds
 * a second caller fails here and goes through the button.
 */
const SRC = join(__dirname, '..', '..');
const OWNER = ['components', 'recordingcheck', 'CheckRecordingsButton.tsx'].join(sep);
const at = (...parts: string[]): string => ['components', ...parts].join(sep);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'api' || name === 'ports' ? [] : sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories|spec)\./.test(name) ? [path] : [];
  });
}
const matching = (pattern: RegExp, except: readonly string[] = [OWNER]): string[] =>
  sources(SRC)
    .map((file) => relative(SRC, file))
    .filter((file) => !except.includes(file) && pattern.test(readFileSync(join(SRC, file), 'utf8')))
    .sort();

describe('one Check recordings (#2833)', () => {
  it('only CheckRecordingsButton.tsx draws the check-recordings icon button', () => {
    expect(matching(/action=["{']+checkRecordings/)).toEqual([]);
  });

  it('no page words its own Check recordings button or menu label', () => {
    expect(matching(/>\s*Check recordings…?\s*</)).toEqual([]);
    expect(matching(/label:\s*[`'"]Check recordings…/)).toEqual([]);
  });

  it('the commands and menus that open the dialog without the button are exactly these', () => {
    expect(matching(/\bopenCheckRecordings\s*\(/, [OWNER, at('recordingcheck', 'openCheckRecordings.tsx')])).toEqual(
      [
        at('booth', 'page', 'useBoothPage.ts'),
        at('editing', 'page', 'useRecordingCheck.tsx'),
        at('pickups', 'PickupsPage.tsx'),
        at('production', 'ProductionPage.tsx'),
        at('production', 'useChapterTools.tsx'),
        at('proof', 'ProofPage.tsx'),
      ].sort(),
    );
  });
});
