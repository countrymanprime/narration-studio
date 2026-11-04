import type { ChapterSyncPreview } from '../../api/contracts/chapterSync';
import { Button } from '../primitives/Button';
import { Dialog } from '../primitives/Dialog';
import { SectionLabel } from '../primitives/SectionLabel';
import { chapterSyncNotChaptersText, chapterSyncProjectName, chapterSyncReasonText, type ChapterSyncDaw } from './chapterSyncText';

/**
 * "Sync chapters to tracks?" shown once per project, the
 * moment `chapterSyncState().ask` is true (a manuscript and a linked DAW project, consent undecided), from every
 * link path. `preview` is `chapterSyncPreview()`'s answer, loaded by the caller; undefined while it is still loading. `daw` is the DAW
 * the project records with: the text names it and, for Audacity, the linked .aup3 rather than `projectFile`.
 */
export function ChapterSyncConsentDialog({
  projectFile,
  daw,
  preview,
  busy,
  onSync,
  onNotNow,
}: {
  projectFile: string;
  daw: ChapterSyncDaw;
  preview: ChapterSyncPreview | undefined;
  busy: boolean;
  onSync: () => void;
  onNotNow: () => void;
}) {
  const notChapters = preview ? chapterSyncNotChaptersText(preview.unmatched, preview.pickupTracks) : undefined;
  return (
    <Dialog
      dismissOnOutsidePress={false}
      title="Sync chapters to tracks?"
      variant="alert"
      description={
        daw.daw === 'Audacity'
          ? `${chapterSyncProjectName(projectFile, daw)} is now linked. The app can tie each chapter to its Audacity track by name, and keep them in step as you add tracks. It only reads what Audacity reports; nothing in Audacity changes. Chapters you linked yourself are kept.`
          : `${projectFile} is now linked. The app can tie each chapter to its REAPER track by name, and keep them in step as you add tracks. It only reads the saved project; nothing in REAPER changes. Chapters you linked yourself are kept.`
      }
      onClose={busy ? undefined : onNotNow}
      escapeCloses={!busy}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onNotNow}>
            Not now
          </Button>
          <Button pending={busy} onClick={onSync} disabled={!preview}>
            {preview ? `Sync ${preview.autoLink.length} chapters` : 'Sync chapters'}
          </Button>
        </>
      }
    >
      {!preview ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {daw.daw === 'Audacity' ? 'Reading the Audacity project…' : 'Reading the saved project…'}
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          <section>
            <SectionLabel as="h3" className="mb-1">
              Will be linked ({preview.autoLink.length})
            </SectionLabel>
            {preview.autoLink.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>None yet.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
                {preview.autoLink.map((link) => (
                  <li key={link.trackGuid} className="truncate">
                    {link.trackName} → {link.chapterTitle}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {preview.needsYou.length > 0 && (
            <section>
              <SectionLabel as="h3" className="mb-1">
                Needs you ({preview.needsYou.length})
              </SectionLabel>
              <ul className="space-y-1">
                {preview.needsYou.map((item) => (
                  <li key={item.chapterId}>
                    <span className="font-semibold">{item.chapterTitle}</span>: {chapterSyncReasonText(item)}
                  </li>
                ))}
              </ul>
              <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
                You choose these after syncing, in the audio engine panel or from the chapter&rsquo;s Recorded cell on Production.
              </p>
            </section>
          )}
          {preview.noTrack.length > 0 && (
            <section>
              <SectionLabel as="h3" className="mb-1">
                Chapters with no track yet ({preview.noTrack.length})
              </SectionLabel>
              <p>{preview.noTrack.map((chapter) => chapter.chapterTitle).join(', ')}</p>
            </section>
          )}
          {notChapters && notChapters.names !== 'None.' && (
            <section>
              <SectionLabel as="h3" className="mb-1">
                Tracks that are not chapters ({preview.unmatched.length + preview.pickupTracks.length})
              </SectionLabel>
              <p>{notChapters.names}</p>
              {notChapters.note && (
                <p className="mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {notChapters.note}
                </p>
              )}
            </section>
          )}
          <p style={{ color: 'var(--text-muted)' }}>
            You can turn chapter sync on or off later in the audio engine panel (the {daw.daw} chip at the top of the window).
          </p>
        </div>
      )}
    </Dialog>
  );
}
