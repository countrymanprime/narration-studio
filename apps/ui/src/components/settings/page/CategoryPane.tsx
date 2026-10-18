import { Button } from '../../primitives/Button';
import { Disclosure } from '../../primitives/Disclosure';
import { Panel } from '../../primitives/Panel';
import { SectionLabel } from '../../primitives/SectionLabel';
import type { Category, SettingMeta } from '../registry/types';
import { RowOf } from './RowOf';

/** Rows in the order they were listed, grouped under their section's title. */
export function bySection(rows: readonly SettingMeta[]): Array<[string, SettingMeta[]]> {
  const groups: Array<[string, SettingMeta[]]> = [];
  for (const row of rows) {
    const group = groups.find(([section]) => section === row.section);
    if (group) group[1].push(row);
    else groups.push([row.section, [row]]);
  }
  return groups;
}

function Section({ title, rows, lit }: { title: string; rows: readonly SettingMeta[]; lit: string | null }) {
  return (
    <section aria-label={title} className="flex flex-col">
      <SectionLabel as="h3" className="mb-1.5">
        {title}
      </SectionLabel>
      <Panel flush>
        {rows.map((row) => (
          <RowOf key={row.id} row={row} flash={lit === row.id} />
        ))}
      </Panel>
    </section>
  );
}

/** One category: its title and blurb, its sections, and Advanced (closed until opened). */
export function CategoryPane({
  category,
  rows,
  changed,
  advancedOpen,
  onToggleAdvanced,
  onReset,
  lit,
  extra,
}: {
  category: Category;
  rows: readonly SettingMeta[];
  changed: number;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  onReset: () => void;
  lit: string | null;
  /** Drawn under the sections and above Advanced (App & updates puts the version there). */
  extra?: React.ReactNode;
}) {
  const basic = rows.filter((row) => !row.advanced);
  const advanced = rows.filter((row) => row.advanced);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="settings-heading" tabIndex={-1} className="font-['Barlow_Condensed',sans-serif] text-[1.875rem] leading-[1.1] font-semibold outline-none">
            {category.label}
          </h2>
          <p className="m-0 text-[0.8125rem] text-[var(--text-muted)]">{category.blurb}</p>
        </div>
        {changed > 0 && (
          <Button variant="link" onClick={onReset}>
            Reset {category.label} to defaults
          </Button>
        )}
      </div>
      {bySection(basic).map(([title, group]) => (
        <Section key={title} title={title} rows={group} lit={lit} />
      ))}
      {extra}
      {advanced.length > 0 && (
        <Disclosure title="Advanced" summary={`(${advanced.length})`} open={advancedOpen} onOpenChange={onToggleAdvanced}>
          <div id={`advanced-${category.id}`} className="mt-1.5 flex flex-col gap-4">
            {bySection(advanced).map(([title, group]) => (
              <Section key={title} title={title} rows={group} lit={lit} />
            ))}
          </div>
        </Disclosure>
      )}
    </>
  );
}
