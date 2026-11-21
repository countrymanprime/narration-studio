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
  const [proof, setProof] = useState<Proof>();
  const [job, setJob] = useState<Awaited<ReturnType<typeof measure.measureState>>>();
  const [prep, setPrep] = useState<Prep>();
  // The chapter list is the store's, shared with every page: mounting does not read it again. A new `refreshKey` (an import, a project switch) asks the
  // store for it now, as it re-reads the measurement, so a lost `job:ended` or a first failed read does not leave the list behind.
  const refreshes = useRef({ key: refreshKey, count: 0 });
  if (refreshes.current.key !== refreshKey) refreshes.current = { key: refreshKey, count: refreshes.current.count + 1 };
  const { chapters, error: listError } = useChapters(active, refreshes.current.count);

  useEffect(() => {
    if (!active) return;
    let live = true;
    findings.findingsList({}).then(
      (page) => live && setProof(proofByChapter(page.findings)),
      () => live && setProof(undefined),
    );
    measure.measureState().then(
      (state) => live && setJob(state),
      () => live && setJob(undefined),
    );
    scriptPrep.scriptPrepList().then(
      (record) => live && setPrep(Object.fromEntries(record.chapters.map((chapter) => [chapterIdOfPrepId(chapter.chapterId), chapter.state]))),
      () => live && setPrep(undefined),
    );
    return () => {
      live = false;
    };
  }, [active, refreshKey, findings, measure, scriptPrep]);

  // A list whose last read failed may not match the measurement: no pairing then, never a stale fact.
  const list = listError ? undefined : chapters;
  const master = useMemo<Master | undefined>(() => (list && job?.files.length ? masterByChapter(list, job.files) : undefined), [list, job]);
  const failing = useMemo<NextUpInputs['failing']>(() => (list && job ? failingChapter(list, job.files, job.profile ?? null) : null), [list, job]);

  return { proof, master, prep, failing };
}
