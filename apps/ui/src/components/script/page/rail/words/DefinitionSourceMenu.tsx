import { useState } from 'react';
import { Button } from '../../../../primitives/Button';
import { Popover } from '../../../../primitives/Popover';
import { DEFINITION_SOURCES, type DefinitionSource } from './wordsHost';

/** "Definitions from": the narrator's choice between the web page, the local dictionary and the online service. */
export function DefinitionSourceMenu({ current, onPick }: { current: DefinitionSource; onPick: (source: DefinitionSource) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      label="Definition sources"
      align="end"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="secondary" size="sm" aria-label={`Definition source: ${DEFINITION_SOURCES[current]}`}>
          Source: {DEFINITION_SOURCES[current]}
        </Button>
      }
    >
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {(Object.keys(DEFINITION_SOURCES) as DefinitionSource[]).map((key) => (
          <li key={key}>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              aria-current={key === current || undefined}
              onClick={() => {
                setOpen(false);
                onPick(key);
              }}
            >
              {DEFINITION_SOURCES[key]}
            </Button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
