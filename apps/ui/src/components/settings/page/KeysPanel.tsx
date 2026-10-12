import type { CommandDescriptor } from '../../../input/commands.catalog';
import { gestureKeys } from '../../../input/hints';
import type { Keymap } from '../../../input/keymap';
import { commandsFor } from '../../../input/surfaces';
import { useUserKeymap } from '../../../input/useUserKeymap';
import { KeyChord } from '../../primitives/KeyCap';
import { Panel } from '../../primitives/Panel';

/**
 * The mock's "Keyboard shortcuts" panel: a read-only list of `commands` with the narrator's gestures for each, the ways told apart
 * by "or" as the "?" sheet draws them. Takes props only. Remapping stays in the kept Keyboard & pedals category.
 */
export function KeysList({ commands, keymap }: { commands: readonly CommandDescriptor[]; keymap: Keymap }) {
  return (
    <Panel title="Keyboard shortcuts">
      <ul className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2">
        {commands.map((command) => (
          <li key={command.id} className="flex items-center justify-between gap-4">
            <span data-command-label="">{command.label}</span>
            <span className="flex flex-wrap items-center justify-end gap-x-1 gap-y-0.5 text-xs text-[var(--text-muted)]">
              {(keymap[command.id] ?? []).map((gesture, index) => {
                const keys = gestureKeys(gesture);
                return (
                  <span key={index} className="inline-flex items-center gap-1">
                    {index > 0 && (
                      <span className="mx-0.5" aria-hidden="true">
                        or
                      </span>
                    )}
                    <span role="img" aria-label={keys.join(' + ')}>
                      <KeyChord keys={keys} />
                    </span>
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * Settings > Keyboard shortcuts: every command the catalogue lists on `settings` (`commandsFor`), with `Keymap.overrides` on top
 * of the defaults (`useUserKeymap`), so a row added to the catalogue shows here with no other edit. `catalog` is for a test's fake rows.
 */
export function KeysPanel({ catalog }: { catalog?: readonly CommandDescriptor[] }) {
  const keymap = useUserKeymap(undefined, catalog);
  return <KeysList commands={commandsFor('settings', catalog)} keymap={keymap} />;
}
