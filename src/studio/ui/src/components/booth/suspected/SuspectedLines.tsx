import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import { overlay } from '../../../overlay/overlayService';
import { retryAction } from '../../primitives/Toast';
import { usePort } from '../../../ports/usePort';
import { putBack } from '../../../studio/commands/reviewFinding';
import { useJournalOrOwn } from '../../../studio/StudioProvider';
import { IconButton } from '../../primitives/IconButton';
import { InsetCard } from '../../primitives/InsetCard';
import { StatusBadge } from '../../primitives/StatusBadge';
import { KIND_LABELS, keptLines, suspectedCount, suspectedKey, suspectedLines, toFlagSave, type SuspectedFlag } from './suspectedLinesModel';

/**
 * The Booth side panel's "Suspected" section (research mock `pages/booth/SidePanel.tsx`). The host's live check lists lines it
 * suspects were skipped or read again; each can be dismissed, with Undo, and a dismissed place comes back dismissed. The decision is the
 * finding's own (`TeleprompterSaveFlags`), so Proof sees it. There is no way to add a line here.
 */
export function SuspectedLines({ chapterId, flags: given }: { chapterId: string; flags: readonly SuspectedFlag[] }) {
  const flags = useMemo(() => suspectedLines(given), [given]);
  // The lines the second listen cleared are shown, as Not confirmed, but never saved: the host would drop them again.
  const kept = useMemo(() => keptLines(flags), [flags]);
  const teleprompter = usePort('teleprompter');
  const findings = usePort('findings');
  const journal = useJournalOrOwn();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [versions, setVersions] = useState<ReadonlyMap<string, { id: string; evidenceVersion: string }>>(new Map());

  const keep = useCallback(
    async (list: readonly SuspectedFlag[], dismissNow: ReadonlySet<string>, retired: readonly SuspectedFlag[] = []) => {
      // A line the second listen cleared after it was saved is retired the host's way: one more save records it as dismissed.
      const sent = [...list, ...retired.map(({ check: _check, ...flag }) => flag)];
      const retiredKeys = new Set(retired.map(suspectedKey));
      const stored = await teleprompter.teleprompterSaveFlags(
        chapterId,
        sent.map((flag) => toFlagSave(flag, retiredKeys.has(suspectedKey(flag)) || dismissNow.has(suspectedKey(flag)))),
      );
      const closed = new Set<string>();
      const ids = new Map<string, { id: string; evidenceVersion: string }>();
      stored.forEach((finding, index) => {
        const key = suspectedKey(sent[index]);
        if (retiredKeys.has(key)) return;
        if (finding.review.status === 'dismissed') closed.add(key);
        ids.set(key, { id: finding.id, evidenceVersion: finding.evidence_version ?? '' });
      });
      setDismissed(closed);
      setVersions(ids);
    },
    [teleprompter, chapterId],
  );

  // Reading the same place again changes nothing: the host answers each flag with its stored decision. The save follows the places, not the
  // array: the page rebuilds the same flags when a take stops, and that must not save them a second time (#2538).
  const places = kept.map((flag) => suspectedKey(flag)).join('|');
  const current = useRef(kept);
  current.current = kept;
  const everySaved = useRef(new Set<string>());
  const cleared = flags.filter((flag) => flag.check === 'cleared');
  const clearedKeys = cleared.map(suspectedKey).join('|');
  const clearedNow = useRef(cleared);
  clearedNow.current = cleared;
  useEffect(() => {
    const retired = clearedNow.current.filter((flag) => everySaved.current.has(suspectedKey(flag)));
    if (places === '' && retired.length === 0) return;
    // Reading again is what Retry does (issue #2919).
    const read = (): void =>
      void keep(current.current, new Set(), retired)
        .then(() => {
          current.current.forEach((flag) => everySaved.current.add(suspectedKey(flag)));
          retired.forEach((flag) => everySaved.current.delete(suspectedKey(flag)));
        })
        .catch((reason) => overlay.toast(apiErrorMessage(reason), { tone: 'error', action: retryAction(read) }));
    read();
  }, [places, clearedKeys, keep]);

  const dismiss = async (flag: SuspectedFlag) => {
    const key = suspectedKey(flag);
    const refuse = (reason: unknown) => ({ ok: false as const, refusal: { code: 'host_refused', reason: apiErrorMessage(reason) } });
    // The dismissal is one journal entry, so Ctrl+Z and History take it back as the toast's Undo does.
    const done = await journal.act<null>({
      label: 'Dismissed a suspected line',
      touches: [`proof/finding/${versions.get(key)?.id ?? key}`],
      run: async () => {
        try {
          await keep(kept, new Set([...dismissed, key]));
          return { ok: true, value: null };
        } catch (reason) {
          return refuse(reason);
        }
      },
      undo: async () => {
        const kept = versions.get(key);
        try {
          // Reload so the Undo reaches the stored finding even when the answer above changed its version.
          const latest = await teleprompter.teleprompterSaveFlags(chapterId, [toFlagSave(flag, false)]);
          const target = latest[0] ?? kept;
          await putBack(findings, { id: target.id, evidenceVersion: target.evidence_version ?? kept?.evidenceVersion ?? '' }, 'unreviewed');
          setDismissed((current) => new Set([...current].filter((entry) => entry !== key)));
          return { ok: true, value: null };
        } catch (reason) {
          return refuse(reason);
        }
      },
    });
    if (!done.ok) {
      overlay.toast(done.refusal.reason, { tone: 'error' });
      return;
    }
    const entry = done.value.id;
    overlay.toastUndo(
      'Dismissed.',
      async () => {
        const undone = await journal.undo(entry);
        return undone.ok ? { ok: true } : undone;
      },
      { entry },
    );
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
          const unconfirmed = flag.check === 'cleared';
          return (
            // The pickup card of the Pickups page and the site: a chip for what was suspected, then the line, then the way to dismiss it.
            <li key={key} data-flag={key}>
              <InsetCard frame="snug" className="flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge tone={done || unconfirmed ? 'neutral' : 'warning'} label={KIND_LABELS[flag.kind]} />
                  {flag.check === 'confirmed' ? <StatusBadge tone="success" label="Confirmed" /> : null}
                  {unconfirmed ? <StatusBadge tone="neutral" label="Not confirmed" /> : null}
                  {done ? <span className="text-xs text-[var(--text-muted)]">Dismissed</span> : null}
                  <span className="flex-1" />
                  {done || unconfirmed ? null : (
                    <IconButton
                      action="close"
                      label={`Dismiss: ${flag.script.trim() || KIND_LABELS[flag.kind]}`}
                      size="sm"
                      onClick={() => void dismiss(flag)}
                    />
                  )}
                </div>
                <span className={`line-clamp-2 ${done || unconfirmed ? 'text-[var(--text-muted)]' : ''}`}>
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
