import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../api/errorMessage';
import { useApi } from '../../api/ApiContext';
import type { UpdateStatus, WorkJob } from '../../types';
import { Button } from '../primitives/Button';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { WorkDialog } from '../primitives/WorkDialog';
import { UpdateDownloadDialog } from './UpdateDownloadDialog';
import { brand } from '../../brand.gen';

const BYTES_PER_MB = 1024 * 1024;

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The day of a check, from the host's ISO time, as the app writes a date elsewhere ("Sep 21, 2026"); read in UTC so the day does not change with the time zone. */
function checkedDay(lastChecked: string): string {
  const day = new Date(lastChecked);
  if (Number.isNaN(day.getTime())) return lastChecked.slice(0, 10);
  return day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * What the app knows about newer releases: the newest one on the narrator's channel if it is newer than this build, when the app last
 * looked, and a Check now button. It only reads and reports here: nothing is downloaded from this panel.
 *
 * A setting applies at once, so a check always asks with the channel as it is. The caller gives the panel a new `key` when the channel
 * changes, so it asks the host again for what is available on the new one.
 */
export function UpdatesPanel() {
  const api = useApi();
  const [status, setStatus] = useState<UpdateStatus>();
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const checkButton = useRef<HTMLButtonElement>(null);
  // The narrator's steps toward an update: asked to confirm the download, downloading, asked to confirm the install, and installing.
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirmingInstall, setConfirmingInstall] = useState(false);
  const [installing, setInstalling] = useState<WorkJob>();

  useEffect(() => {
    let active = true;
    api
      .updateStatus()
      // An event that arrived first is newer than this answer.
      .then((next) => active && setStatus((current) => current ?? next))
      .catch((failure) => active && setError(apiErrorMessage(failure)));
    // A check the app makes on its own, after this page opened, that found a release.
    const unsubscribe = api.subscribeUpdate((next) => {
      setStatus(next);
      setError('');
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

  const check = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      setStatus(await api.updateCheck());
    } catch (failure) {
      setError(apiErrorMessage(failure));
    } finally {
      setChecking(false);
      // The button was disabled while it ran, which drops keyboard focus; the result is announced, and focus comes back to it.
      checkButton.current?.focus();
    }
  }, [api]);

  const openNotes = useCallback(() => {
    api.updateOpenNotes().catch((failure) => setError(apiErrorMessage(failure)));
  }, [api]);

  const showDownload = useCallback(() => {
    api.updateShowDownload().catch((failure) => setError(apiErrorMessage(failure)));
  }, [api]);

  // The host replaces the running program and closes the app a moment after it answers; an error here means it changed nothing.
  const install = useCallback(
    async (jobId: string, version: string) => {
      setConfirmingInstall(false);
      setError('');
      setInstalling({ id: jobId, kind: 'app_update', phase: 'running', message: `Installing version ${version}…`, percent: 0, logs: [], elapsed: 0 });
      try {
        const job = await api.updateInstall(jobId);
        setInstalling({ id: job.id, kind: 'app_update', phase: 'running', message: job.message, percent: 0, logs: [job.message], elapsed: 0 });
      } catch (failure) {
        setInstalling(undefined);
        setError(apiErrorMessage(failure));
      }
    },
    [api],
  );

  const errorAlert = error && (
    <p role="alert" className="m-0 text-[var(--danger-text)]">
      {error}
    </p>
  );
  if (!status) return errorAlert ? <div className="flex flex-col gap-2 text-[0.875rem]">{errorAlert}</div> : null;

  const available = status.available;
  // One headline, one muted detail line (the release, whether it is downloaded, when the app last looked), then any failure right under
  // them, then one row of buttons with the main action first and Check now last (alignment audit R3SE1-5, XSE1-6).
  const detail = [
    available ? `${available.candidate ? 'A release candidate' : 'A release'} · ${Math.round(available.size / BYTES_PER_MB)} MB` : '',
    available?.replaces && status.downloaded ? 'downloaded and checked' : '',
    status.lastChecked ? `last checked ${checkedDay(status.lastChecked)}` : '',
  ].filter(Boolean);
  return (
    <div className="flex flex-col items-start gap-2 text-[0.875rem]" data-updates>
      {status.development ? (
        <p className="m-0 text-[var(--text-muted)]">Update checks are for releases. A development build is never offered an update.</p>
      ) : !status.platform ? (
        <p className="m-0 text-[var(--text-muted)]">The app has no release for this kind of computer, so there is nothing to update to.</p>
      ) : (
        <>
          {/* One live region for the result, so a screen reader hears what a check found; it is remembered state, not an alert. */}
          <div role="status" className="flex flex-col gap-0.5">
            {available ? (
              <b className="font-semibold">Version {available.version} is available</b>
            ) : status.failure ? null : status.lastChecked ? (
              <b className="font-semibold">You have the latest version.</b>
            ) : (
              <b className="font-semibold">Not checked yet.</b>
            )}
            {status.failure && <p className="m-0 text-[var(--danger-text)]">{status.failure}</p>}
            {detail.length > 0 && <p className="m-0 text-[0.8125rem] text-[var(--text-muted)]">{capitalise(detail.join(' · '))}</p>}
            {available?.replaces && status.downloaded && !status.canInstall && (
              <p className="m-0 text-[0.8125rem] text-[var(--text-muted)]">{status.installBlockedReason}</p>
            )}
            {available && !available.replaces && (
              <p className="m-0 text-[0.8125rem] text-[var(--text-muted)]">
                This platform does not update itself. Open the release notes to download it from the release page.
              </p>
            )}
          </div>
          {errorAlert}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {available?.replaces && !status.downloaded && <Button onClick={() => setConfirming(true)}>Download update</Button>}
            {available?.replaces && status.downloaded && status.canInstall && <Button onClick={() => setConfirmingInstall(true)}>Install and restart</Button>}
            {available?.replaces && status.downloaded && !status.canInstall && <Button onClick={showDownload}>Show the downloaded file</Button>}
            {available && (
              <Button variant="secondary" aria-label="Release notes (opens in your browser)" onClick={openNotes}>
                Release notes
              </Button>
            )}
            <Button ref={checkButton} variant="secondary" disabled={checking} onClick={() => void check()}>
              {checking ? 'Checking…' : 'Check now'}
            </Button>
          </div>
        </>
      )}
      {(status.development || !status.platform) && errorAlert}
      {confirming && available && (
        <ConfirmDialog
          title={`Download version ${available.version}?`}
          body={`This downloads ${brand.name} ${available.version} (${Math.round(available.size / BYTES_PER_MB)} MB) from GitHub and checks it against the release's checksum. Nothing is installed yet, and you can cancel the download.`}
          confirmLabel="Download"
          confirm={() => {
            setConfirming(false);
            setDownloading(true);
          }}
          cancel={() => setConfirming(false)}
        />
      )}
      {downloading && available && (
        <UpdateDownloadDialog
          available={available}
          close={(result) => {
            setDownloading(false);
            // A download that finished is the host's to report: the status says whether it can be installed.
            if (result === 'ready')
              api
                .updateStatus()
                .then(setStatus)
                .catch((failure) => setError(apiErrorMessage(failure)));
          }}
        />
      )}
      {confirmingInstall && available && status.downloaded && (
        <ConfirmDialog
          title={`Install version ${available.version} and restart?`}
          body={`The app closes and starts again on version ${available.version} with the same project, and REAPER's launcher keeps working. It cannot install while an import, a Story Bible build, a download, a comparison or a teleprompter session is running. If the new version does not start, the previous one comes back by itself.`}
          confirmLabel="Install and restart"
          confirm={() => void install(status.downloaded?.jobId ?? '', available.version)}
          cancel={() => setConfirmingInstall(false)}
        />
      )}
      {installing && <WorkDialog title={`Installing ${brand.name} ${available?.version ?? ''}`.trim()} job={installing} />}
    </div>
  );
}
