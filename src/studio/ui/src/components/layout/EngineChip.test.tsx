// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudacityLink } from '../../api/contracts/daw';
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

// A state that needs the narrator says so in words, not by the dot's colour alone, and a word stays below `md` where the DAW's
// name hides (alignment audit R3SL-2, R3PR1-9, XSL-12).
describe('EngineChip state words', () => {
  it.each([
    ['linked', 'REAPER', { dawReachable: true, dawProjectMatches: true }],
    ['not linked', 'REAPER: Not linked', { dawFileLinked: false }],
    ['not running', 'REAPER: Not running', { dawReachable: false }],
    ['a different project open', 'REAPER: Other project', { dawReachable: true, dawProjectMatches: false }],
  ] as const)('draws the %s state as "%s"', (_state, text, props) => {
    renderChip(props);
    expect(screen.getByRole('button').textContent).toBe(text);
  });

  it('keeps the state word on show below md, hiding only the DAW name before it', () => {
    renderChip({ dawReachable: true, dawProjectMatches: false });
    const button = screen.getByRole('button');
    expect(button.querySelector('.max-md\\:hidden')?.textContent).toBe('REAPER: ');
    expect(button.getAttribute('aria-label')).toMatch(/^REAPER: Other project\. /);
  });

  it('hides nothing of a linked chip or the built-in one below md', () => {
    renderChip({ dawReachable: true, dawProjectMatches: true });
    expect(screen.getByRole('button').querySelector('.max-md\\:hidden')).toBeNull();
    cleanup();
    renderChip({ daw: 'none' });
    expect(screen.getByRole('group').querySelector('.max-md\\:hidden')).toBeNull();
  });

  it('says a state that is also the tooltip once in the name', () => {
    renderChip({ dawReachable: false });
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('REAPER: Not running');
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

// UI-only until native recording chooses it, so it carries no link action.
describe('EngineChip built-in recorder', () => {
  it('is not a button, however the project is linked', () => {
    renderChip({ engine: 'builtin', dawFileLinked: true, dawReachable: true, dawProjectMatches: false });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Built-in')).toBeTruthy();
    expect(screen.queryByText(/REAPER/)).toBeNull();
  });
});

// An Audacity project has no .rpp and no REAPER heartbeat: its chip is worded from the Audacity link state.
describe('EngineChip for Audacity', () => {
  const link = (over: Partial<AudacityLink>): AudacityLink => ({
    hasProject: true,
    chosen: true,
    state: 'answering',
    message: 'Audacity is open and answering.',
    action: 'none',
    steps: [],
    installed: true,
    running: true,
    openProject: 'linked',
    linked: true,
    linkedFile: 'Book One.aup3',
    heardSecondsAgo: 0,
    ...over,
  });
  const label = (over: Partial<AudacityLink>) => {
    cleanup();
    renderChip({ daw: 'Audacity', dawFileLinked: false, audacity: link(over) });
    return screen.getByRole('button').getAttribute('aria-label');
  };

  it('says Linked for an answering Audacity whose open project carries the link', () => {
    expect(label({})).toContain('Linked');
  });

  it('asks to link the open project when Audacity answers with an unlabelled one', () => {
    expect(label({ openProject: 'unlabelled', linked: false })).toContain('Open the engine panel to link the open project');
  });

  it('warns when a different project is open', () => {
    expect(label({ openProject: 'other' })).toContain('A different project is open');
  });

  it.each([
    ['not_running', 'Not running'],
    ['module_off', 'Scripting is off'],
    ['needs_restart', 'Needs a restart'],
    ['dialog', 'May be waiting on a dialog'],
    ['audacity4', "Audacity 4 can't be linked"],
    ['no_project', 'No project open'],
    ['not_installed', 'Not found'],
  ] as const)('names %s as "%s" and points to the engine panel', (state, title) => {
    const text = label({ state, openProject: 'unknown', running: false });
    expect(text).toContain(title);
    expect(text).toContain('Open the engine panel for the steps.');
  });

  it("keeps REAPER's words for REAPER, and for an Audacity not chosen for the project", () => {
    cleanup();
    renderChip({ daw: 'Audacity', dawFileLinked: true, dawReachable: true, dawProjectMatches: true, audacity: link({ chosen: false, state: 'not_running' }) });
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('Linked');
  });
});
