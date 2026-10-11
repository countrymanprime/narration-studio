import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../primitives/Button';
import { Checkbox } from '../primitives/Checkbox';
import { RadioGroup } from '../primitives/RadioGroup';
import { SlideOver } from '../primitives/SlideOver';
import { applyOption, currentOption, isOptionOn, MOCK_GROUPS } from './mockStates';

// Dev-only (ADR-free): the mock build mounts it beside <App /> when the URL asks for `?mockPanel=1`. Choosing an option
// rewrites the mock URL parameters and reloads, because `main.tsx` reads them once at boot; it adds no live mutation to the
// mock host. Nothing here is part of the app.
export function MockStatesPanel({ reload = () => window.location.reload() }: { reload?: () => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(() => window.location.search);

  function write(next: string) {
    window.history.replaceState(null, '', `${window.location.pathname}${next}${window.location.hash}`);
    setSearch(next);
    reload();
  }

  return (
    <>
      <div className="fixed right-4 bottom-4 z-40">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Mock states
        </Button>
      </div>
      <SlideOver open={open} title="Mock states" onClose={() => setOpen(false)}>
        <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
          This panel forces states and is not part of the app. Each choice sets a mock URL parameter and reloads.
        </p>
        <div className="space-y-5">
          {MOCK_GROUPS.map((group) =>
            group.kind === 'radio' ? (
              <div key={group.id}>
                <p className="mb-1.5 text-sm font-semibold">{group.label}</p>
                <RadioGroup
                  label={group.label}
                  value={currentOption(group, search).value}
                  options={group.options}
                  onChange={(value) => {
                    const option = group.options.find((candidate) => candidate.value === value);
                    if (option) write(applyOption(search, group, option));
                  }}
                />
              </div>
            ) : (
              <fieldset key={group.id} className="space-y-1">
                <legend className="mb-1 text-sm font-semibold">{group.label}</legend>
                {group.options.map((option) => (
                  <Checkbox key={option.value} checked={isOptionOn(option, search)} onChange={(on) => write(applyOption(search, group, option, on))}>
                    {option.label}
                  </Checkbox>
                ))}
              </fieldset>
            ),
          )}
        </div>
      </SlideOver>
    </>
  );
}

/** Mounts the panel in its own root on `document.body`, so it stays out of the app's tree. */
export function mountMockStatesPanel(): void {
  const host = document.createElement('div');
  document.body.append(host);
  createRoot(host).render(<MockStatesPanel />);
}
