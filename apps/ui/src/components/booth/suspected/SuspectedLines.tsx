import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { IconButton } from '../../primitives/IconButton';
import { KIND_LABELS, suspectedCount, suspectedKey, suspectedLines, toFlagSave, type SuspectedFlag } from './suspectedLines';

/**
 * The Booth side panel's "Suspected" section (Studio Next mock `pages/booth/SidePanel.tsx`). The host's live check lists lines it
 * suspects were skipped or read again; each can be dismissed, with Undo, and a dismissed place comes back dismissed. The decision is the
 * finding's own (`TeleprompterSaveFlags`, ADR 0117), so Proof sees it. There is no way to add a line here.
 */
export function SuspectedLines({ chapterId, flags: given }: { chapterId: string; flags: readonly SuspectedFlag[] }) {
  const flags = useMemo(() => suspectedLines(given), [given]);
  const teleprompter = usePort('teleprompter');
  const findings = usePort('findings');
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [versions, setVersions] = useState<ReadonlyMap<string, { id: string; evidenceVersion: string }>>(new Map());

  const keep = useCallback(
    async (list: readonly SuspectedFlag[], dismissNow: ReadonlySet<string>) => {
      const stored = await teleprompter.teleprompterSaveFlags(
        chapterId,
        list.map((flag) => toFlagSave(flag, dismissNow.has(suspectedKey(flag)))),
      );
      const closed = new Set<string>();
      const ids = new Map<string, { id: string; evidenceVersion: string }>();
      stored.forEach((finding, index) => {
        const key = suspectedKey(list[index]);
        if (finding.review.status === 'dismissed') closed.add(key);
        ids.set(key, { id: finding.id, evidenceVersion: finding.evidence_version ?? '' });
      });
      setDismissed(closed);
      setVersions(ids);
    },
    [teleprompter, chapterId],
  );

  // Reading the same place again changes nothing: the host answers each flag with its stored decision.
  useEffect(() => {
    if (flags.length === 0) return;
    keep(flags, new Set()).catch((reason) => overlay.toast(describeApiError(reason), { tone: 'error' }));
  }, [flags, keep]);

  const dismiss = async (flag: SuspectedFlag) => {
    const key = suspectedKey(flag);
    try {
      await keep(flags, new Set([...dismissed, key]));
    } catch (reason) {
      overlay.toast(describeApiError(reason), { tone: 'error' });
      return;
    }
    overlay.toastUndo('Dismissed.', async () => {
      const kept = versions.get(key);
      try {
        // Reload so the Undo reaches the stored finding even when the answer above changed its version.
        const latest = await teleprompter.teleprompterSaveFlags(chapterId, [toFlagSave(flag, false)]);
        const target = latest[0] ?? kept;
        await findings.findingsReview({
          id: target.id,
          evidenceVersion: target.evidence_version ?? kept?.evidenceVersion ?? '',
          status: 'unreviewed',
          note: '',
        });
        setDismissed((current) => new Set([...current].filter((entry) => entry !== key)));
        return { ok: true };
      } catch (reason) {
        return { ok: false, refusal: { reason: describeApiError(reason) } };
      }
    });
  };

  const open = useMemo(() => suspectedCount(flags, dismissed), [flags, dismissed]);
  if (flags.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5" aria-labelledby="suspected-heading">
      <h3 id="suspected-heading" className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">
        Suspected · {open}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {flags.map((flag) => {
          const key = suspectedKey(flag);
          const done = dismissed.has(key);
          return (
            <li key={key} className="flex items-center gap-2 text-sm" data-flag={key}>
              <span className={done ? 'min-w-0 flex-1 truncate text-[var(--text-muted)]' : 'min-w-0 flex-1 truncate'}>
                {KIND_LABELS[flag.kind]} · {flag.script}
                {flag.heard ? <span className="text-[var(--text-muted)]"> · heard “{flag.heard}”</span> : null}
              </span>
              {done ? (
                <span className="text-xs text-[var(--text-muted)]">Dismissed</span>
              ) : (
                <IconButton action="close" label={`Dismiss: ${flag.script}`} size="sm" onClick={() => void dismiss(flag)} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
