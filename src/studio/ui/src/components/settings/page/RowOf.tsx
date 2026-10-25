import { CUSTOM, WIDE_BODIES } from '../controls/registry';
import { SettingRowView } from '../row/SettingRowView';
import type { SettingMeta } from '../registry/types';

/** A row drawn with the control its registry entry names: a custom body, or the host field's own control. */
export function RowOf({ row, flash }: { row: SettingMeta; flash?: boolean }) {
  const Body = CUSTOM[row.id];
  return Body ? (
    <SettingRowView row={row} flash={flash} wide={WIDE_BODIES.has(row.id)}>
      <Body />
    </SettingRowView>
  ) : (
    <SettingRowView row={row} flash={flash} />
  );
}
