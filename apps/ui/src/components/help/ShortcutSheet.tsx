import { Button } from '../primitives/Button';
import { Dialog } from '../primitives/Dialog';
import { KeyChord } from '../primitives/KeyCap';
import type { CommandDescriptor } from '../../input/commands.catalog';
import { gestureKeys, nonKeyHints, type FooterSurface } from '../../input/hints';
import { CommandScope } from '../../input/router';
import type { Scope } from '../../input/scopes';
import { commandsFor } from '../../input/surfaces';
import { useUserKeymap } from '../../input/useUserKeymap';

// Grouped the same way the Keyboard & pedals Settings category groups them. This order is display-only, unrelated to
// `SCOPE_PRIORITY` (router.tsx), which orders scopes by specificity for gesture lookup, not for reading.
const SCOPE_ORDER: readonly Scope[] = ['global', 'page', 'booth', 'dialog'];
const SCOPE_LABEL: Record<Scope, string> = { global: 'Global', page: 'Page', booth: 'Booth', dialog: 'Dialog' };

const FOOTER_SURFACES: readonly FooterSurface[] = ['booth', 'proof'];

// The ways to do a command that are not keys ("Right-click" to start from here), by the command they follow.
function extrasByCommand(): Map<string, { keys: string[]; label: string }[]> {
  const extras = new Map<string, { keys: string[]; label: string }[]>();
  for (const surface of FOOTER_SURFACES) {
    for (const { after, keys, label } of nonKeyHints(surface)) extras.set(after, [...(extras.get(after) ?? []), { keys, label }]);
  }
  return extras;
}

function groupByScope(commands: readonly CommandDescriptor[]): Partial<Record<Scope, CommandDescriptor[]>> {
  const groups: Partial<Record<Scope, CommandDescriptor[]>> = {};
  for (const command of commands) (groups[command.scope] ??= []).push(command);
  return groups;
}

// The "?" (Shift+Slash) shortcut sheet: the rows of the catalogue that list on `help` (`commandsFor`), grouped by scope,
// each with the narrator's gestures for it (their remaps over the defaults) drawn as key caps, the ways told apart by
// "or" (the mock's `help.tsx`). Its content claims the router's `dialog` scope (ADR 0361 decision 4): while it is open, a
// `global` command like Back/Forward no longer matches (`activeScopes`, router.tsx), the same way any other open dialog
// already stops them through `App.tsx`'s own `isModalOpen` check. `catalog` is for a test's fake rows.
export function ShortcutSheet({ onClose, onShowAll, catalog }: { onClose: () => void; onShowAll: () => void; catalog?: readonly CommandDescriptor[] }) {
  const keymap = useUserKeymap(undefined, catalog);
  const groups = groupByScope(commandsFor('help', catalog));
  const extras = extrasByCommand();

  return (
    <CommandScope kind="dialog">
      <Dialog title="Keyboard shortcuts" onClose={onClose} actionsAlign="end" actions={<Button onClick={onShowAll}>Show all shortcuts</Button>}>
        <div className="flex flex-col gap-4">
          {SCOPE_ORDER.filter((scope) => groups[scope]?.length).map((scope) => (
            <section key={scope}>
              <h3 className="mb-2 text-[0.75rem] font-semibold tracking-[0.04em] text-[var(--text-muted)] uppercase">{SCOPE_LABEL[scope]}</h3>
              <ul className="flex flex-col gap-2">
                {groups[scope]!.map((command) => (
                  <li key={command.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span>{command.label}</span>
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
                    {(extras.get(command.id) ?? []).map((extra) => (
                      <span key={extra.label} className="flex basis-full items-center justify-end gap-2 text-xs text-[var(--text-muted)]">
                        <span>{extra.label}</span>
                        <KeyChord keys={extra.keys} />
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Dialog>
    </CommandScope>
  );
}
