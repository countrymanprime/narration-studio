import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '../../../api/errorMessage';
import type { ProductionRateBasis } from '../../../api/contracts/production';
import { usePort } from '../../../ports/usePort';
import { RadioGroup } from '../../primitives/RadioGroup';
import { announceRateBasis, subscribeRateBasis } from '../../schedule/useEffectiveWph';
import { IconButton } from '../../primitives/IconButton';
import { MarksList } from '../page/MarksPanel';
import { useMarks } from '../../script/page/data/useScriptData';
import { MarksDialog } from '../../script/page/tools/select/MarksDialog';
import { useSaveMarkTypes } from '../../script/scriptPageHost';
import { ManuscriptBody } from '../ManuscriptSection';
import { DeleteStoryBibleData } from '../page/DeleteStoryBibleData';
import { ClearProjectData } from '../page/ProjectDataPanel';
import { StoryBibleTypesList, useStoryBibleTypes } from '../page/StoryBibleTypesPanel';
import { useSettingsHost } from '../row/SettingsHost';

/** Manuscript: when it was imported and its size, with Replace manuscript… (or Import manuscript when there is none). */
export function ManuscriptRowBody() {
  const { data, go, notify, refreshBootstrap } = useSettingsHost();
  return <ManuscriptBody data={data} go={go} notify={notify} refreshBootstrap={refreshBootstrap} />;
}

/** Entry types: rename, colour, Can speak, entry count, Remove, and New type. */
export function StoryBibleTypesRowBody() {
  return <StoryBibleTypesList {...useStoryBibleTypes()} />;
}

/** Marks: a pill per mark type and Edit marks…, which opens the Script page's Define marks dialog. */
export function MarksRowBody() {
  const marks = useMarks();
  const [editing, setEditing] = useState(false);
  const saveMarkTypes = useSaveMarkTypes(marks.retry);
  return (
    <>
      {/* The pills on the left and Edit marks at the top right, beside them, not wrapped alone under the pills (alignment audit XSE2-23, XSE1-15). */}
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <MarksList
          types={marks.value ? marks.types : undefined}
          error={marks.status === 'error' ? `The mark types could not be read: ${marks.message}` : undefined}
        />
        <IconButton action="edit" label="Edit marks…" disabled={!marks.value} onClick={() => setEditing(true)} />
      </div>
      {editing && <MarksDialog saveMarkTypes={saveMarkTypes} onClose={() => setEditing(false)} />}
    </>
  );
}

/** Clear derived data…, which asks first. */
export function ProjectDataRowBody() {
  const { notify, onProjectDataCleared } = useSettingsHost();
  return <ClearProjectData notify={notify} onProjectDataCleared={onProjectDataCleared} label="Clear derived data…" />;
}

/** Delete Story Bible data…, which says what goes and asks first. The Story Bible page has no delete of its own. */
export function StoryBibleDataRowBody() {
  const { data, notify } = useSettingsHost();
  return <DeleteStoryBibleData projectName={data.projectFolder ? data.projectName : undefined} notify={notify} />;
}

const BASIS_OPTIONS: { value: ProductionRateBasis; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'own', label: 'Your own pace' },
];

/**
 * Schedule basis: whether the hours on Production and Schedule use the standard words per finished hour or this narrator's measured pace, the
 * same choice as the Production target popover's toggle (the plan's `rateBasis`). It follows a choice made there while it is shown. A read
 * that was started before a save, or that is overtaken by a later read, is dropped, so the row shows what the host last answered; a choice
 * is sent once until the host has answered; a read that fails is reported once until a read succeeds.
 */
export function RateBasisBody() {
  const production = usePort('production');
  const { notify } = useSettingsHost();
  const [basis, setBasis] = useState<ProductionRateBasis | null>(null);
  const [saving, setSaving] = useState(false);
  const latest = useRef(0);
  const reported = useRef(false);
  const read = useCallback(() => {
    const mine = ++latest.current;
    production.productionPlan().then(
      (plan) => {
        if (mine !== latest.current) return;
        reported.current = false;
        setBasis(plan.rateBasis ?? 'standard');
      },
      (failure: unknown) => {
        if (mine !== latest.current || reported.current) return;
        reported.current = true;
        notify(`The schedule basis could not be read: ${apiErrorMessage(failure)}`, 'error');
      },
    );
  }, [production, notify]);
  useEffect(() => {
    read();
    window.addEventListener('focus', read);
    const stop = subscribeRateBasis((next) => {
      latest.current += 1;
      setBasis(next ?? 'standard');
    });
    return () => {
      window.removeEventListener('focus', read);
      stop();
    };
  }, [read]);
  const choose = (next: ProductionRateBasis) => {
    if (saving) return;
    latest.current += 1;
    setSaving(true);
    production.setProductionRateBasis(next).then(
      (saved) => {
        latest.current += 1;
        setSaving(false);
        setBasis(saved.rateBasis ?? 'standard');
        announceRateBasis(saved.rateBasis);
      },
      (failure: unknown) => {
        setSaving(false);
        notify(`The schedule basis was not saved: ${apiErrorMessage(failure)}`, 'error');
      },
    );
  };
  const options = BASIS_OPTIONS.map((option) => ({ ...option, disabled: basis === null || saving }));
  return <RadioGroup label="Schedule basis" value={basis ?? 'standard'} onChange={choose} options={options} />;
}
