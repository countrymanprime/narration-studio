import { useState } from 'react';
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
