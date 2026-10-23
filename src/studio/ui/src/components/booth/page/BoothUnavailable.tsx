import { useCommand } from '../../../input/useCommand';
import { Button } from '../../primitives/Button';
import { Heading } from '../../primitives/Heading';
import { Panel } from '../../primitives/Panel';
import { CommandScope } from '../../../input/router';
import { CREDITS_LABEL } from '../readerModel';
import type { BoothUnavailable as Unavailable } from './useBoothData';

/**
 * What the Booth shows when the page asked for has nothing to read: credits whose template is missing or empty, or a chapter the book does not
 * have. The Booth fills the window, so with nothing drawn there is no sidebar and no button: this says what is missing and how to go on. The
 * chapters button leaves for the chapter list, as Escape does, rather than reopening the Booth on a chapter.
 */
export function BoothUnavailable({
  why,
  onSetUpCredits,
  onChapters,
  onExit,
}: {
  why: Unavailable;
  onSetUpCredits: () => void;
  onChapters: () => void;
  onExit: () => void;
}) {
  useCommand('booth.exit', onExit);
  const credits = why.kind === 'credits';
  return (
    <CommandScope kind="booth">
      <div className="p-4 md:p-6">
        <Panel label="Booth">
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <Heading title={credits ? `The ${why.credits} credits are not set up` : 'That chapter is not in this book'} />
            <p className="m-0 max-w-[60ch] text-[var(--text-muted)]">
              {credits
                ? `The Booth reads the ${CREDITS_LABEL[why.credits].toLowerCase()} from your credits template, and this project has none to read. Set it up in Settings, or go back to the chapters.`
                : 'The Booth reads the chapters of this book. Go back to the chapters to pick one.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {credits && <Button onClick={onSetUpCredits}>Set up credits in Settings</Button>}
              <Button variant={credits ? 'secondary' : 'primary'} onClick={onChapters}>
                Back to the chapters
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </CommandScope>
  );
}
