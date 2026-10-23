import type { ChapterSyncBackground } from '../../../api/contracts/chapterSync';
import { Button } from '../../primitives/Button';
import { Dialog } from '../../primitives/Dialog';
import { modelPairText } from './backgroundCheckText';

/**
 * "Check recordings in the background?" shown once, the first time the host has a changed chapter it would check on its own
 * (`background.wait` is `confirm`). Nothing starts until the narrator answers: Check in the background confirms; Not now turns
 * background checks off (Settings > Speech to text > Background checks turns them on again).
 */
export function BackgroundChecksNotice({
  background,
  busy,
  onAllow,
  onNotNow,
}: {
  background: ChapterSyncBackground;
  busy: boolean;
  onAllow: () => void;
  onNotNow: () => void;
}) {
  const models = modelPairText(background);
  const chapters = `${background.queued} chapter${background.queued === 1 ? '' : 's'}`;
  return (
    <Dialog
      dismissOnOutsidePress={false}
      title="Check recordings in the background?"
      variant="alert"
      description={`${chapters} changed since ${background.queued === 1 ? 'its' : 'their'} last check. The app can listen back to what you recorded while you work and mark skipped or misread words, so they are ready on Editing and Pickups.`}
      onClose={busy ? undefined : onNotNow}
      escapeCloses={!busy}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onNotNow}>
            Not now
          </Button>
          <Button pending={busy} onClick={onAllow}>
            Check in the background
          </Button>
        </>
      }
    >
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>
          It uses Whisper {models}
          {background.recheckModel ? `: ${background.firstPassModel} listens first and ${background.recheckModel} double-checks what it was unsure of.` : '.'}
        </li>
        <li>Only audio no check has listened to is checked. Earlier takes are not checked again unless you change the model or the audio.</li>
        <li>It runs on part of this computer&rsquo;s processors, below everything else, and never while REAPER is recording.</li>
        <li>A bar at the bottom left shows its progress on every page, with Pause and Cancel.</li>
      </ul>
      <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        Change the models, the processors it may use or turn it off in Settings &rsaquo; Speech to text &rsaquo; Background checks.
      </p>
    </Dialog>
  );
}
