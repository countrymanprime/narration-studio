// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineChip } from './EngineChip';
import { TooltipProvider } from '../primitives/Tooltip';

afterEach(cleanup);

function renderChip(props: Partial<Parameters<typeof EngineChip>[0]> = {}) {
  return render(
    <TooltipProvider>
      <EngineChip daw="REAPER" dawFileLinked onOpenEnginePanel={() => {}} {...props} />
    </TooltipProvider>,
  );
}

// The chip says which recorder the project is connected to, by the name the DAW capabilities give; whether it is running is in the
// tooltip (the Studio Next mock's top bar). A click still opens the engine panel, which holds the link and relink action.
describe('EngineChip label', () => {
  it.each([
    ['REAPER', 'REAPER'],
    ['Audacity', 'Audacity'],
    ['none', 'Built-in'],
  ] as const)('shows %s as "%s"', (daw, label) => {
    renderChip({ daw, dawReachable: true, dawProjectMatches: true });
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('names no DAW before the capabilities have answered', () => {
    renderChip({ daw: undefined });
    expect(screen.queryByText(/REAPER|Audacity|Built-in/)).toBeNull();
  });
});

describe('EngineChip tooltips', () => {
  it('says "Linked" for a reachable DAW whose open project is the linked one', () => {
    renderChip({ dawReachable: true, dawProjectMatches: true });
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('Linked');
  });

  it('adds the chapter the DAW is following when it is known', () => {
    renderChip({ dawReachable: true, dawProjectMatches: true, followingChapter: 'Chapter 7' });
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('Linked · following Chapter 7');
  });

  it('says "Not running" for a DAW that is not reachable', () => {
    renderChip({ dawReachable: false });
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('Not running');
  });

  it('says the wrong project is open when the DAW is reachable with a different one', () => {
    renderChip({ dawReachable: true, dawProjectMatches: false });
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('different project');
  });

  it('points to the engine panel when no project is linked', () => {
    renderChip({ dawFileLinked: false });
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('Open the engine panel to link a project file');
  });

  it('says recording happens in the app for the built-in recorder', () => {
    renderChip({ daw: 'none' });
    expect(screen.getByLabelText(/Recording happens in the app/)).toBeTruthy();
  });
});

describe('EngineChip click', () => {
  it('opens the engine panel, and stays pressable while a link runs, marked busy', () => {
    const onOpenEnginePanel = vi.fn();
    renderChip({ linkingDawFile: true, onOpenEnginePanel });
    const chip = screen.getByRole('button');
    expect(chip.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(chip);
    expect(onOpenEnginePanel).toHaveBeenCalledTimes(1);
  });
});

// UI-only until native recording chooses it (Q7), so it carries no link action.
describe('EngineChip built-in recorder', () => {
  it('is not a button, however the project is linked', () => {
    renderChip({ engine: 'builtin', dawFileLinked: true, dawReachable: true, dawProjectMatches: false });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Built-in')).toBeTruthy();
    expect(screen.queryByText(/REAPER/)).toBeNull();
  });
});
