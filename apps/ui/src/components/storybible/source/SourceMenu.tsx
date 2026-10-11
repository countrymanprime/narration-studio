import { useState, type ReactElement } from 'react';
import type { PronunciationSource } from '../../../api/contracts/pronunciationSources';
import { Button } from '../../primitives/Button';
import { Icon } from '../../primitives/Icon';
import { Popover } from '../../primitives/Popover';
import { sourceIcon } from './sourceIcons';

/** The kept alternate (ADR 0346): the other value of a name, offered under the sources so switching back is one press. */
export type KeptAlternate = { label: string; onUse: () => void };

/**
 * Every source the host lists, the narrator's own among them. A source that cannot answer is listed disabled with the host's
 * reason beneath it. Picking one closes the menu and reports its id; the caller decides what that does.
 */
export function SourceMenu({
  trigger,
  sources,
  current,
  onPick,
  alternate,
}: {
  trigger: ReactElement;
  sources: readonly PronunciationSource[];
  current: string;
  onPick: (id: string) => void;
  alternate?: KeptAlternate;
}) {
  const [open, setOpen] = useState(false);
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <Popover trigger={trigger} label="Pronunciation sources" align="start" open={open} onOpenChange={setOpen}>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {sources.map((source) => (
          <li key={source.id} className="flex flex-col">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              disabled={!source.available}
              aria-current={source.id === current || undefined}
              aria-describedby={source.available ? undefined : `pronunciation-source-${source.id}-reason`}
              onClick={choose(() => onPick(source.id))}
            >
              <Icon name={sourceIcon(source.id)} />
              {source.label}
            </Button>
            {!source.available && source.reason && (
              <span id={`pronunciation-source-${source.id}-reason`} className="px-3 pt-0.5 text-xs text-[var(--text-muted)]">
                {source.reason}
              </span>
            )}
          </li>
        ))}
        {alternate && (
          <li className="border-t border-[var(--line)] pt-1">
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={choose(alternate.onUse)}>
              {alternate.label}
            </Button>
          </li>
        )}
      </ul>
    </Popover>
  );
}
