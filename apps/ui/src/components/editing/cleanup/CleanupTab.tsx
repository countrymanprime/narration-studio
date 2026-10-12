import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeApiError } from '../../../api/errorMessage';
import type { Finding } from '../../../api/contracts/findings';
import { overlay } from '../../../overlay/overlayService';
import { usePort } from '../../../ports/usePort';
import type { Journal } from '../../../studio/journal/createJournal';
import { useDawKind } from '../../../useDawKind';
import { applyCleanupCommand, previewOf, type CleanupDeps, type CleanupPreview } from './cleanupApply';
import { initialParams, opSpec, type CleanupKind, type CleanupParams, type Level, type ParamKey } from './cleanupOps';
import { countsOf, noiseFloorOf, proposals, selectedRows } from './cleanupRows';
import { CleanupHeader } from './CleanupHeader';
import { CleanupInspector } from './CleanupInspector';
import { CleanupList } from './CleanupList';
import { usePreviewPlay, type PreviewPlayback } from './usePreviewPlay';

const NO_TRIM = 'The DAW cannot trim ranges here yet.';

export interface CleanupTabProps {
  chapterId: string;
  journal: Pick<Journal, 'act'>;
  /** The DAW's range cut and the cuts port, lent by the page. Without it Apply stays off with the reason. */
  deps?: CleanupDeps;
  /** The page's playback, the one the take's Play uses, lent for Preview. Without it Preview lists and says it cannot play. */
  playback?: PreviewPlayback;
}

/** The Clean up tab: the operation filter, the findings of the chosen one, and the inspector with its thresholds, Preview and Apply. */
export function CleanupTab({ chapterId, journal, deps, playback }: CleanupTabProps) {
  const findingsPort = usePort('findings');
  const editing = usePort('editing');
  const daw = usePort('daw');
  const dawName = useDawKind() ?? 'the DAW';
  const [findings, setFindings] = useState<Finding[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [dawReason, setDawReason] = useState<string | null>(null);
  const [op, setOp] = useState<CleanupKind>('gaps');
  const [params, setParams] = useState(initialParams);
  const [skip, setSkip] = useState<string[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const previewPlay = usePreviewPlay(playback);

  useEffect(() => {
    let live = true;
    Promise.all([findingsPort.findingsList({ chapterId }), editing.editingCandidates(chapterId)])
      .then(([page, candidates]) => {
        if (!live) return;
        const seen = new Set<string>();
        setFindings([...page.findings, ...candidates].filter((f) => !seen.has(f.id) && !!seen.add(f.id)));
        setReadError(null);
      })
      .catch((reason: unknown) => live && setReadError(describeApiError(reason)));
    return () => {
      live = false;
    };
  }, [findingsPort, editing, chapterId, version]);

  useEffect(() => {
    let live = true;
    daw
      .capabilities()
      .then((caps) => {
        if (!live) return;
        const support = caps.capabilities['cut_range'];
        if (!caps.reachable) setDawReason(`${caps.daw === 'none' ? 'The DAW' : caps.daw} is not running.`);
        else setDawReason(support && !support.available ? (support.message ?? 'The DAW cannot cut ranges.') : null);
      })
      .catch(() => live && setDawReason('The DAW did not answer.'));
    return () => {
      live = false;
    };
  }, [daw]);

  const rows = useMemo(() => proposals(findings, op, params[op]), [findings, op, params]);
  const counts = useMemo(() => countsOf(findings, params), [findings, params]);
  const on = selectedRows(rows, skip);
  const fixed = rows.filter((r) => r.done).length;

  const choose = (next: CleanupKind) => {
    previewPlay.stop();
    setOp(next);
    setPreview(null);
  };
  const setLevel = (level: Level) => {
    setParams((p) => ({ ...p, [op]: { ...opSpec(op).levels[level] } }));
    setPreview(null);
  };
  const setParam = (key: ParamKey, value: number) => {
    setParams((p) => ({ ...p, [op]: { ...p[op], [key]: value } as CleanupParams }));
    setPreview(null);
  };
  const toggle = useCallback((keys: string[], include: boolean) => {
    setSkip((s) => (include ? s.filter((k) => !keys.includes(k)) : [...new Set([...s, ...keys])]));
    setPreview(null);
  }, []);

  const apply = async () => {
    if (!deps) return;
    setBusy(true);
    const result = await journal.act(applyCleanupCommand(op, on, params[op], chapterId, deps, dawName));
    setBusy(false);
    setPreview(null);
    if (!result.ok) {
      overlay.toast(result.refusal.reason, { tone: 'error' });
      return;
    }
    const { applied, stale, refused } = result.value.value;
    const parts = [`Hid ${applied.length} on the muted Cuts track.`];
    if (stale.length) parts.push(`${stale.length} no longer matched an item and ${stale.length === 1 ? 'was' : 'were'} left alone.`);
    if (refused) parts.push(refused);
    overlay.toast(parts.join(' '), refused ? { tone: 'error' } : undefined);
    setVersion((v) => v + 1);
  };

  return (
    <div className="flex flex-col">
      <div className="border-b border-[var(--border)] p-3">
        <CleanupHeader counts={counts} op={op} onOp={choose} />
      </div>
      {readError ? (
        <p role="alert" className="m-0 p-3 text-[var(--danger-text)]">
          {readError}
        </p>
      ) : null}
      <CleanupList kind={op} rows={rows} params={params[op]} skip={skip} onToggle={(k, c) => toggle([k], c)} onToggleAll={toggle} />
      <CleanupInspector
        kind={op}
        params={params[op]}
        open={rows.length - fixed}
        fixed={fixed}
        selected={on.length}
        advanced={advanced}
        onAdvanced={setAdvanced}
        onLevel={setLevel}
        onParam={setParam}
        noiseFloor={noiseFloorOf(findings)}
        dawReason={dawReason ?? (deps ? null : NO_TRIM)}
        preview={preview}
        onPreview={() => {
          setPreview(previewOf(op, on, params[op], dawName));
          previewPlay.start(on, on.length);
        }}
        previewNote={
          previewPlay.status ? { text: previewPlay.status, playing: true } : previewPlay.reason ? { text: previewPlay.reason, playing: false } : null
        }
        onStopPreview={previewPlay.stop}
        onApply={() => void apply()}
        busy={busy}
      />
    </div>
  );
}
