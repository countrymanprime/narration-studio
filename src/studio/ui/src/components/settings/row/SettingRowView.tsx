import { useId, useState, type ReactNode } from 'react';
import { Button } from '../../primitives/Button';
import { ConfirmDialog } from '../../primitives/ConfirmDialog';
import { HelpButton } from '../../primitives/HelpButton';
import { IconButton } from '../../primitives/IconButton';
import { StatusBadge } from '../../primitives/StatusBadge';
import { useSettingsStore } from '../data/SettingsStore';
import { choiceLabel, computerValue, isAnyChanged, isChanged, overrideValue, projectValue } from '../data/values';
import { PAGE_LABEL, PAGE_PATH, type Scope, type SettingMeta } from '../registry/types';
import { rowOf } from '../registry/rows';
import { AssetNote } from './AssetNote';
import { useSettingsNav } from './SettingsNav';
import { ValueControl } from './ValueControl';
import { WorkerPlanNote } from './WorkerPlanNote';

const SCOPE_LABEL: Record<Scope, string> = { computer: 'This computer', project: 'This project', both: 'All projects', browser: 'This computer' };

/** Whose the setting is, and where this project differs. */
function ScopeBadge({ row, overridden }: { row: SettingMeta; overridden: boolean }) {
  return (
    <span data-scope={row.scope} className={row.scope === 'project' ? 'text-[var(--accent-strong)]' : ''}>
      {SCOPE_LABEL[row.scope]}
      {overridden && <b className="font-semibold text-[var(--accent-strong)]"> · overridden here</b>}
    </span>
  );
}

/** The pages that read this setting; each link goes there. The setting is changed here, once. */
function UsedBy({ row }: { row: SettingMeta }) {
  const { go } = useSettingsNav();
  if (row.used.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span>Used by</span>
      {row.used.map((page) => (
        <Button
          key={page}
          variant="link"
          size="sm"
          data-used={page}
          aria-label={`Used by ${PAGE_LABEL[page]}. Go to ${PAGE_LABEL[page]}`}
          onClick={() => go(PAGE_PATH[page])}
        >
          {PAGE_LABEL[page]}
        </Button>
      ))}
    </span>
  );
}

// A label column and a control column (docs/design/design-system.md#settings-rows): stacked in a narrow page, a fixed 12 rem label column
// from 761 px of page width, `minmax(12rem,16rem)` from 860 (a width in `layoutBreakpoints.ts`). Two equal halves left a tall control's left half empty and pushed every
// control a different distance from its label (alignment audit cause E). Stacked, 12 px part the meta line from the control under it (R3SE2-15).
/** "Saved", fading after a moment; the caller keys it by the save, so the next save of the same row starts it again. */
function SavedWord() {
  return <span className="flex-none text-[0.8125rem] text-[var(--ok-text)] motion-ok:animate-[settings-saved_2.5s_forwards]">Saved</span>;
}

const SETTING_ROW_GRID =
  'grid gap-x-8 gap-y-3 @min-[761px]:gap-y-1.5 @min-[761px]:grid-cols-[12rem_minmax(0,1fr)] @min-[860px]:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]';
const CELL = `${SETTING_ROW_GRID} border-t border-[var(--border)] px-5 py-4 first:border-t-0`;

/**
 * One setting: what it is, whose it is, who reads it, and its control. A change applies at once; a changed row says so in words and can be
 * reset; a row that allows a project override shows whether this project uses the computer value or its own. A row with `children` draws
 * that control instead of the host field's (the setting is more than one value); a `wide` one draws it under the label across the whole row,
 * for a table or a form that needs the width (alignment audit XSE2-4, XSE2-11).
 */
export function SettingRowView({ row, children, flash, wide }: { row: SettingMeta; children?: ReactNode; flash?: boolean; wide?: boolean }) {
  const store = useSettingsStore();
  const uid = useId();
  const [asking, setAsking] = useState<string>();
  const { global, project } = store.fieldsOf(row);
  const controlId = `set-${row.id}`;
  const error = store.rowErrors[row.id];
  const hasCustom = children !== undefined;
  const comp = computerValue(row, global);
  const own = overrideValue(row, project);
  const changed = hasCustom ? false : isAnyChanged(row, global, project);
  const saved = store.saved?.row === row.id;
  const heavy = hasCustom || !global ? undefined : row.heavy?.(comp);
  const describedBy = `${uid}d${error ? ` ${uid}e` : ''}`;

  /** What the host is sent: a value equal to the default clears the setting instead of pinning it, an emptied number is "not set". */
  const toSend = (value: string, scope: 'global' | 'project'): string | null => {
    if (value === '' && global?.kind === 'number') return null;
    return scope === 'global' && value === row.def ? null : value;
  };
  const commit = (value: string, scope: 'global' | 'project') => void store.write(row, scope, toSend(value, scope));
  const apply = (value: string, scope: 'global' | 'project') => {
    const problem = row.check?.(value);
    store.setRowError(row.id, problem);
    if (problem) return;
    if (row.costly && scope === 'global') setAsking(value);
    else commit(value, scope);
  };
  const defaultLabel = global?.kind === 'choice' ? choiceLabel(row, row.def) : row.def || 'empty';
  const kindOf = (rowId: string): string => {
    const other = rowOf(rowId);
    return other ? computerValue(other, store.fieldsOf(other).global) : '';
  };

  return (
    <div
      className={`${CELL} relative scroll-mt-24 ${flash ? 'bg-[var(--accent-soft)]' : ''}`}
      data-row={row.id}
      data-changed={changed ? 'true' : undefined}
      data-scope={row.scope}
    >
      {/* The bar runs the row's full height, so it marks the row instead of interrupting the card's edge (R3SE1-16, XSE2-34). */}
      {changed && <span aria-hidden="true" data-changed-bar className="absolute inset-y-0 left-0 w-[3px] bg-[var(--info)]" />}
      <div className="flex min-w-0 flex-col gap-[3px]">
        {/* The title line is as tall as the Changed badge with or without it, so a switch beside it stays level (XSE1-22, XSE2-34). */}
        <span data-title-line className="flex min-h-6 flex-wrap items-center gap-2">
          <label htmlFor={hasCustom ? undefined : controlId} id={`${uid}l`} className="text-[0.9375rem] font-semibold">
            {row.label}
          </label>
          {row.more && <HelpButton label={`About ${row.label}`}>{row.more}</HelpButton>}
          {changed && <StatusBadge tone="info" label="Changed" />}
        </span>
        <span id={`${uid}d`} className="max-w-[60ch] text-[0.8125rem] text-[var(--text-muted)]">
          {row.desc}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-0.5 text-[0.78rem] text-[var(--text-muted)]">
          <ScopeBadge row={row} overridden={own !== undefined} />
          <UsedBy row={row} />
          {row.also && <span>Also set in {row.also}</span>}
        </span>
      </div>
      <div className={`flex max-w-full min-w-0 flex-col items-start gap-2 ${wide ? 'col-span-full' : ''}`} data-row-body={wide ? 'wide' : undefined}>
        {hasCustom ? (
          children
        ) : global ? (
          <>
            {/* The row of the control and its Reset takes the column's width, so the control's own `w-full` has a width to resolve against.
                Saved shows beside Reset, where the change was made (XSE1-22). */}
            <div data-control-line className="flex w-full min-w-0 flex-nowrap items-center gap-1.5">
              <ValueControl
                row={row}
                field={global}
                id={controlId}
                value={comp}
                which={row.scope === 'both' ? 'all projects' : undefined}
                describedBy={describedBy}
                invalid={Boolean(error)}
                onChange={(value) => apply(value, 'global')}
              />
              {isChanged(row, global) && (
                <IconButton
                  action="undo"
                  label={`Reset ${row.label} to ${defaultLabel}`}
                  className="border-transparent"
                  onClick={() => void store.write(row, 'global', null)}
                />
              )}
              {saved && <SavedWord key={store.saved?.n} />}
            </div>
            {global.kind === 'choice' && <AssetNote row={row} value={comp} kindOf={kindOf} />}
            {row.scope === 'both' && project && (
              <div
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[0.8125rem] text-[var(--text-muted)]"
                data-override={own !== undefined ? row.id : undefined}
              >
                {own !== undefined ? (
                  <>
                    <span>This project uses</span>
                    <ValueControl
                      row={row}
                      field={project}
                      id={`${controlId}-p`}
                      value={projectValue(row, global, project)}
                      which="this project"
                      describedBy={describedBy}
                      onChange={(value) => apply(value, 'project')}
                    />
                    <Button
                      variant="link"
                      size="sm"
                      aria-label={`Use computer setting for ${row.label}`}
                      onClick={() => void store.write(row, 'project', null)}
                    >
                      Use computer setting
                    </Button>
                    {global.kind === 'choice' && <AssetNote row={row} value={own} kindOf={kindOf} />}
                  </>
                ) : (
                  <>
                    <span>This project uses the computer setting.</span>
                    <Button variant="link" size="sm" aria-label={`Override for this project: ${row.label}`} onClick={() => commit(comp, 'project')}>
                      Override for this project
                    </Button>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <span className="text-[0.8125rem] text-[var(--text-muted)]">This setting is not offered by this version of the app.</span>
        )}
        {row.effect && <span className="text-[0.8125rem] text-[var(--text-muted)]">{row.effect}</span>}
        {row.live === 'workerPlan' && global && <WorkerPlanNote value={own ?? comp} again={store.saved?.n} />}
        {heavy && (
          <span data-heavy={row.id} className="max-w-[52ch] text-[0.8125rem] text-[var(--warn-text)]">
            {heavy}
          </span>
        )}
        <span id={`${uid}e`} className="min-h-0 text-[0.8125rem]">
          {error ? (
            <span className="flex max-w-[52ch] items-start gap-1.5 text-[var(--danger-text)]">
              <span
                aria-hidden="true"
                className="mt-0.5 inline-block size-4 flex-none rounded-full bg-[var(--danger)] text-center text-[0.6875rem] leading-4 font-bold text-[var(--surface)]"
              >
                !
              </span>
              {error}
            </span>
          ) : saved && (hasCustom || !global) ? (
            <SavedWord key={store.saved?.n} />
          ) : null}
        </span>
      </div>
      {asking !== undefined && row.costly && (
        <ConfirmDialog
          title={row.costly.title}
          body={row.costly.body}
          confirmLabel={row.costly.confirm}
          confirm={() => {
            commit(asking, 'global');
            setAsking(undefined);
          }}
          cancel={() => setAsking(undefined)}
        />
      )}
    </div>
  );
}
