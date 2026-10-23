import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import { IconButton } from '../../primitives/IconButton';
import { InsetCard } from '../../primitives/InsetCard';
import { StatusBadge } from '../../primitives/StatusBadge';
import { KIND_LABELS, suspectedCount, suspectedKey, suspectedLines, toFlagSave, type SuspectedFlag } from './suspectedLinesModel';

/**
 * The Booth side panel's "Suspected" section (Studio Next mock `pages/booth/SidePanel.tsx`). The host's live check lists lines it
 * suspects were skipped or read again; each can be dismissed, with Undo, and a dismissed place comes back dismissed. The decision is the
 * finding's own (`TeleprompterSaveFlags`), so Proof sees it. There is no way to add a line here.
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
    keep(flags, new Set()).catch((reason) => overlay.toast(apiErrorMessage(reason), { tone: 'error' }));
  }, [flags, keep]);

  const dismiss = async (flag: SuspectedFlag) => {
    const key = suspectedKey(flag);
    try {
      await keep(flags, new Set([...dismissed, key]));
    } catch (reason) {
      overlay.toast(apiErrorMessage(reason), { tone: 'error' });
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
        return { ok: false, refusal: { reason: apiErrorMessage(reason) } };
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
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {flags.map((flag) => {
          const key = suspectedKey(flag);
          const done = dismissed.has(key);
          return (
            // The pickup card of the Pickups page and the site: a chip for what was suspected, then the line, then the way to dismiss it.
            <li key={key} data-flag={key}>
              <InsetCard frame="snug" className="flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge tone={done ? 'neutral' : 'warning'} label={KIND_LABELS[flag.kind]} />
                  {done ? <span className="text-xs text-[var(--text-muted)]">Dismissed</span> : null}
                  <span className="flex-1" />
                  {done ? null : <IconButton action="close" label={`Dismiss: ${flag.script}`} size="sm" onClick={() => void dismiss(flag)} />}
                </div>
                <span className={`line-clamp-2 ${done ? 'text-[var(--text-muted)]' : ''}`}>
                  {flag.script}
                  {flag.heard ? <span className="text-[var(--text-muted)]"> · heard “{flag.heard}”</span> : null}
                </span>
              </InsetCard>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
