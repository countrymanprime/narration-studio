import { useEffect, useMemo, useRef, useState } from 'react';
import type { Finding } from '../../api/contracts/findings';
import type { ManuscriptChapter, MeasureFileResult } from '../../types';
import { usePort } from '../../ports/usePort';
import { useChapters } from '../../studio/useChapters';
import { chapterIdOfPrepId } from '../credits/creditsEntries';
import { fileOf } from '../master/chapterFile';
import { fileVerdict } from '../master/fileVerdict';
import type { NextUpInputs } from './pipeline/nextUpRanking';
import { failingChapter } from './pipeline/nextUpSources';
import type { PipelineSources } from './pipeline/pipelineRows';

type Proof = NonNullable<PipelineSources['proof']>;
type Master = NonNullable<PipelineSources['master']>;
type Prep = NonNullable<PipelineSources['prep']>;

/** The notes of the latest run per chapter: all of them, and the cleared ones (dismissed, which includes waived: docs/guides/using-the-app/proof.md, as `proofProgress` counts). */
function proofByChapter(findings: readonly Finding[]): Proof {
  const byChapter: Record<string, { cleared: number; total: number }> = {};
  for (const finding of findings) {
    const id = finding.manuscript?.chapter_id;
    if (!id || finding.not_in_latest_run) continue;
    const entry = (byChapter[id] ??= { cleared: 0, total: 0 });
    entry.total += 1;
    if (finding.review.status === 'dismissed') entry.cleared += 1;
  }
  return byChapter;
}

/**
 * The delivery review per chapter, from the host's per-file judgement (the one rule Delivery and Master & QC pair a file with its chapter by).
 * The credits files are paired the same way: the chapter list holds the credits. A chapter with no measured file has no entry; a file with no verdict is not mastered and not checked. Several failing checks read as `FAIL`,
 * not one check's name (the mock's QC cell).
 */
export function masterByChapter(chapters: readonly Pick<ManuscriptChapter, 'id' | 'title' | 'index'>[], files: readonly MeasureFileResult[]): Master {
  const byChapter: Record<string, { mastered: boolean; qc: string | null }> = {};
  for (const chapter of chapters) {
    const file = fileOf(chapter, files, chapters);
    if (!file) continue;
    const verdict = fileVerdict(file);
    byChapter[chapter.id] = { mastered: verdict !== 'none', qc: verdict === 'pass' ? 'PASS' : verdict === 'fail' ? 'FAIL' : null };
  }
  return byChapter;
}

/**
 * The Proof and Master cells' sources for the pipeline, read through the ports the Proof and Master & QC pages use. A source the host
 * cannot answer, or that has no reading for a chapter, stays absent so its cell reads "Not measured yet". It reads again when
 * `refreshKey` changes. Prep is the Script page's prep record. `failing` is Next up's first chapter that fails the delivery check, from the same measured files.
 */
export function usePipelineSources(
  active: boolean,
  refreshKey: string,
): Pick<PipelineSources, 'proof' | 'master' | 'prep'> & { failing: NextUpInputs['failing'] } {
  const findings = usePort('findings');
  const measure = usePort('measure');
  const scriptPrep = usePort('scriptPrep');
  const [proofRead, setProofRead] = useState<{ value: Proof | undefined; epoch: number }>();
  const [read, setRead] = useState<{ state: Awaited<ReturnType<typeof measure.measureState>> | undefined; epoch: number; key: string }>();
  const [prepRead, setPrepRead] = useState<{ value: Prep | undefined; epoch: number }>();
  // The chapter list is the store's, shared with every page: mounting does not read it again. A new `refreshKey` (an import, a project switch) asks the
  // store for it now, as it re-reads the measurement, so a lost `job:ended` or a first failed read does not leave the list behind.
  const refreshes = useRef({ key: refreshKey, count: 0 });
  const lastList = useRef<readonly ManuscriptChapter[] | undefined>(undefined);
  const staleList = useRef<readonly ManuscriptChapter[] | undefined>(undefined);
  if (refreshes.current.key !== refreshKey) {
    refreshes.current = { key: refreshKey, count: refreshes.current.count + 1 };
    staleList.current = lastList.current;
  }
  const { chapters, error: listError } = useChapters(active, refreshes.current.count);
  lastList.current = chapters;
  // A project switch empties the list; the measurement read before it is the old project's. Each emptying starts a new epoch: the measurement is read
  // again in it, and one read in an earlier epoch is never paired with the new list.
  const listSeen = useRef({ held: false, epoch: 0 });
  if (chapters) listSeen.current.held = true;
  else if (listSeen.current.held) listSeen.current = { held: false, epoch: listSeen.current.epoch + 1 };
  const epoch = listSeen.current.epoch;

  useEffect(() => {
    if (!active) return;
    let live = true;
    findings.findingsList({}).then(
      (page) => live && setProofRead({ value: proofByChapter(page.findings), epoch }),
      () => live && setProofRead({ value: undefined, epoch }),
    );
    measure.measureState().then(
      (state) => live && setRead({ state, epoch, key: refreshKey }),
      () => live && setRead({ state: undefined, epoch, key: refreshKey }),
    );
    scriptPrep.scriptPrepList().then(
      (record) =>
        live && setPrepRead({ value: Object.fromEntries(record.chapters.map((chapter) => [chapterIdOfPrepId(chapter.chapterId), chapter.state])), epoch }),
      () => live && setPrepRead({ value: undefined, epoch }),
    );
    return () => {
      live = false;
    };
  }, [active, refreshKey, epoch, findings, measure, scriptPrep]);
  // Only what was read in this project (epoch) counts, and the measurement must also be the one asked for under this refresh key.
  const proof = proofRead?.epoch === epoch ? proofRead.value : undefined;
  const prep = prepRead?.epoch === epoch ? prepRead.value : undefined;
  const job = read?.epoch === epoch && read.key === refreshKey ? read.state : undefined;

  // A list whose last read failed may not match the measurement: no pairing then, never a stale fact.
  // After a new key the list the store still holds is the old one until its read answers: it is not paired with the new measurement.
  const list = listError || chapters === staleList.current ? undefined : chapters;
  const master = useMemo<Master | undefined>(() => (list && job?.files.length ? masterByChapter(list, job.files) : undefined), [list, job]);
  const failing = useMemo<NextUpInputs['failing']>(() => (list && job ? failingChapter(list, job.files, job.profile ?? null) : null), [list, job]);

  return { proof, master, prep, failing };
}
