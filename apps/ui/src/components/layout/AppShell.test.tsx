// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell, shellPages } from './AppShell';
import { TooltipProvider } from '../primitives/Tooltip';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { DawMockSeed } from '../../api/dawMock';

afterEach(cleanup);

const defaultZoom = { percent: 100, announcement: '' };

function renderShell(props: Partial<Parameters<typeof AppShell>[0]> = {}, daw: DawMockSeed = {}) {
  const api = createMockApi({}, { daw });
  return render(
    <ApiProvider api={api}>
      <TooltipProvider>
        <AppShell
          pathname="/"
          navigate={() => {}}
          projectName="Alice"
          hasManuscript
          dawFileLinked
          onOpenEnginePanel={() => {}}
          zoom={defaultZoom}
          onOpenJump={() => {}}
          onOpenZoomMenu={() => {}}
          onSwitchProject={() => {}}
          {...props}
        >
          <div>page content</div>
        </AppShell>
      </TooltipProvider>
    </ApiProvider>,
  );
}

describe('AppShell on the Booth', () => {
  it('draws no rail, header or drawer on /booth, only the page in its own main', () => {
    renderShell({ pathname: '/booth' });
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Switch project/ })).toBeNull();
    expect(within(screen.getByRole('main')).getByText('page content')).toBeTruthy();
  });

  // Issue 1720: with no manuscript the Booth is the empty state, which needs the way out the full window takes away.
  it('keeps the rail on the Booth when there is no manuscript to record', () => {
    renderShell({ pathname: '/booth', hasManuscript: false });
    expect(screen.getAllByRole('button', { name: 'Production' }).length).toBeGreaterThan(0);
  });

  it('keeps the rail and header on every other page', () => {
    renderShell({ pathname: '/script' });
    expect(screen.getAllByRole('button', { name: 'Booth' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Switch project/ })).toBeTruthy();
  });
});

describe('AppShell nav gating', () => {
  const GATED = ['Schedule', 'Script', 'Story Bible', 'Booth', 'Editing', 'Proof', 'Pickups', 'Master & QC', 'Delivery'];
  const REASON = 'Import a manuscript to unlock this page.';
  const railItem = (name: string) => within(screen.getByRole('complementary', { name: 'Primary navigation' })).getByRole('button', { name });

  // The mock's rail draws these off with no manuscript (the mock changed first), and each page still asks for the manuscript itself.
  it('turns the nine pages that need a manuscript off with no manuscript: focusable, named, and saying why', () => {
    renderShell({ hasManuscript: false, dawFileLinked: false });
    for (const name of GATED) {
      const item = railItem(name);
      expect(item.getAttribute('aria-disabled'), name).toBe('true');
      expect((item as HTMLButtonElement).disabled, name).toBe(false);
      expect(document.getElementById(item.getAttribute('aria-describedby') ?? '')?.textContent, name).toBe(REASON);
    }
    for (const name of ['Production', 'Settings']) expect(railItem(name).getAttribute('aria-disabled'), name).toBeNull();
  });

  it('turns every page on once a manuscript is imported', () => {
    renderShell({ hasManuscript: true, dawFileLinked: false });
    for (const name of GATED) expect(railItem(name).getAttribute('aria-disabled'), name).toBeNull();
  });

  it('never navigates from an off item: a press opens a note with the reason instead', () => {
    const navigate = vi.fn();
    renderShell({ hasManuscript: false, navigate });
    fireEvent.click(railItem('Proof'));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Proof is unavailable' }).textContent).toContain(REASON);
  });

  it('keeps the page open and its item current when the manuscript goes: it turns off in place and keeps focus', () => {
    const view = renderShell({ pathname: '/proof', hasManuscript: true });
    railItem('Proof').focus();
    view.rerender(
      <ApiProvider api={createMockApi({}, { daw: {} })}>
        <TooltipProvider>
          <AppShell
            pathname="/proof"
            navigate={() => {}}
            projectName="Alice"
            hasManuscript={false}
            dawFileLinked
            onOpenEnginePanel={() => {}}
            zoom={defaultZoom}
            onOpenJump={() => {}}
            onOpenZoomMenu={() => {}}
            onSwitchProject={() => {}}
          >
            <div>page content</div>
          </AppShell>
        </TooltipProvider>
      </ApiProvider>,
    );
    const proof = railItem('Proof');
    expect(proof.getAttribute('aria-disabled')).toBe('true');
    expect(proof.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('page content')).toBeTruthy();
  });

  it('lists the same pages off in "Go to", with the same reason and none for Production or Settings', () => {
    const pages = shellPages({ hasManuscript: false, dawFileLinked: false });
    expect(pages.filter((page) => page.disabledReason).map((page) => page.label)).toEqual(GATED);
    expect(pages.find((page) => page.id === '/')?.disabledReason).toBeUndefined();
    expect(pages.find((page) => page.id === '/settings')?.disabledReason).toBeUndefined();
    expect(shellPages({ hasManuscript: true, dawFileLinked: false }).every((page) => !page.disabledReason)).toBe(true);
  });

  // Proof replaces Proofing and Review, and its compare run gates itself on
  // the DAW inside the chapter view (CompareRun.test.tsx), so the nav item is never off - not for a missing file, nor for REAPER.
  it('never gates Proof, with no linked file and with REAPER not connected', () => {
    renderShell({ hasManuscript: true, dawFileLinked: false }, { connected: false });
    expect(screen.getAllByRole('button', { name: 'Proof' }).every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.queryAllByRole('button', { name: 'Proofing' })).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'Review' })).toHaveLength(0);
  });

  it('marks Proof active on the book level and on a chapter view', () => {
    renderShell({ pathname: '/proof/chapter-1' });
    expect(screen.getAllByRole('button', { name: 'Proof' }).some((button) => button.getAttribute('aria-current') === 'page')).toBe(true);
  });
});

describe('AppShell engine chip', () => {
  it('names the DAW the capabilities report and opens the engine panel on click', () => {
    const onOpenEnginePanel = vi.fn();
    renderShell({ daw: 'Audacity', dawFileLinked: true, dawReachable: true, dawProjectMatches: true, onOpenEnginePanel });
    const chip = screen.getByRole('button', { name: /^Audacity: / });
    expect(chip.textContent).toBe('Audacity');
    fireEvent.click(chip);
    expect(onOpenEnginePanel).toHaveBeenCalledTimes(1);
  });

  it('hard-codes no DAW: with no answer yet the chip names none', () => {
    renderShell({ daw: undefined });
    expect(screen.queryByText(/REAPER|Audacity/)).toBeNull();
  });
});

// docs/architecture/principles.md: the nav is grouped by production stage, and Production is the item at `/`.
describe('AppShell grouped navigation', () => {
  it('names every group (sidebar, rail and drawer all expose the same accessible name)', () => {
    renderShell();
    for (const label of ['Production', 'Prep', 'Record', 'Edit', 'Review', 'Finish']) {
      expect(screen.getAllByRole('group', { name: label }).length).toBeGreaterThan(0);
    }
  });

  // The Studio Next mock (docs/research/mockups/studio-next, the frozen reference these values came from) draws a heading over every group but the first: Production and Schedule sit
  // straight under the brand block. The first group keeps its name for a screen reader, as an `aria-label` in place of the heading.
  it('draws a heading over every group but the first, which is named by aria-label', () => {
    const { container } = renderShell();
    for (const label of ['Prep', 'Record', 'Edit', 'Review', 'Finish']) {
      const heading = container.querySelector(`#nav-group-${label.toLowerCase()}`);
      expect(heading?.textContent).toBe(label);
      expect(heading?.className).not.toMatch(/\bsr-only\b/);
      expect(heading?.className).toMatch(/\bsection-label\b/);
    }
    expect(container.querySelector('#nav-group-production')).toBeNull();
    expect(container.querySelector('[role="group"][aria-label="Production"]')).not.toBeNull();
  });

  // The icon rail draws a rule in place of each heading (components.css `.icon-rail`, the mock's `.rail-c .grp::before`), which needs the rail
  // panel's class and a positioned heading to hang from. Geometry is measured in tests/visual/navRail.spec.ts.
  it('marks the rail panel and positions every group heading for the icon rail rules', () => {
    const { container } = renderShell();
    expect(container.querySelector('aside > div')?.classList.contains('icon-rail')).toBe(true);
    for (const label of ['Prep', 'Record', 'Edit', 'Review', 'Finish']) {
      expect(container.querySelector(`#nav-group-${label.toLowerCase()}`)?.classList.contains('relative')).toBe(true);
    }
  });

  // The rail's glyphs are the Studio Next mock's (Shell.tsx NAV through Icon.tsx), drawn from the icon catalogue so a page wears one icon everywhere.
  it("draws each rail item with the mock's glyph", () => {
    const { container } = renderShell();
    const nav = container.querySelector('aside nav')!;
    const glyph = (name: string) =>
      [...nav.querySelectorAll('button')]
        .find((b) => b.textContent?.startsWith(name))
        ?.querySelector('svg')
        ?.getAttribute('data-icon');
    expect({
      production: glyph('Production'),
      schedule: glyph('Schedule'),
      script: glyph('Script'),
      bible: glyph('Story Bible'),
      booth: glyph('Booth'),
      editing: glyph('Editing'),
      proof: glyph('Proof'),
      pickups: glyph('Pickups'),
      master: glyph('Master'),
      delivery: glyph('Delivery'),
    }).toEqual({
      production: 'house',
      schedule: 'calendar-days',
      script: 'file-lines',
      bible: 'book',
      booth: 'microphone',
      editing: 'scissors',
      proof: 'wave-square',
      pickups: 'list-check',
      master: 'gauge',
      delivery: 'upload',
    });
  });

  // The Production home replaced Home at `/`, as the Production group's one item, active on `/` and nowhere else.
  it("has Production, not Home, as the Production group's item, active at /", () => {
    renderShell({ pathname: '/' });
    expect(screen.queryAllByRole('button', { name: 'Home' })).toHaveLength(0);
    const [item] = screen.getAllByRole('group', { name: 'Production' });
    const button = within(item).getByRole('button', { name: 'Production' });
    expect(button.getAttribute('aria-current')).toBe('page');
  });

  // SN-P8 (schedule-route-and-rail-item): the Studio Next rail has Schedule after Production in the Production group, with no count.
  it('schedule-route-and-rail-item: lists Production then Schedule in the Production group, Schedule with no count, and opens /schedule', () => {
    const navigate = vi.fn();
    renderShell({ navigate, navCounts: { proof: 2, pickups: 3 } });
    const group = screen.getAllByRole('group', { name: 'Production' })[0];
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent?.trim()),
    ).toEqual(['Production', 'Schedule']);
    fireEvent.click(within(group).getByRole('button', { name: 'Schedule' }));
    expect(navigate).toHaveBeenCalledWith('/schedule');
  });

  it('schedule-route-and-rail-item: "Go to Schedule" is a page with or without a manuscript', () => {
    for (const hasManuscript of [true, false]) expect(shellPages({ hasManuscript, dawFileLinked: false }).map((page) => page.id)).toContain('/schedule');
  });

  it('lists every other page, with Production in place of Home, Proof in place of Proofing and Review and Booth in place of the Teleprompter', () => {
    renderShell();
    for (const name of ['Production', 'Schedule', 'Script', 'Story Bible', 'Booth', 'Editing', 'Proof', 'Pickups', 'Master & QC', 'Delivery', 'Settings']) {
      expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0);
    }
  });

  // SN-E9 (route-and-rail): the Studio Next rail (the mock's `NAV` in app/Shell.tsx) has Editing in an Edit group of its own,
  // between Record and Review, with no count; Proof stays Proof, so there is never a second Proof item.
  it('route-and-rail: lists Editing alone in an Edit group between Record and Review, with no count, and opens /editing', () => {
    const navigate = vi.fn();
    const { container } = renderShell({ navigate, navCounts: { proof: 2, pickups: 3 } });
    const edit = screen.getAllByRole('group', { name: 'Edit' })[0];
    expect(
      within(edit)
        .getAllByRole('button')
        .map((button) => button.textContent?.trim()),
    ).toEqual(['Editing']);
    const headings = [...container.querySelectorAll('[id^="nav-group-"]')].map((heading) => heading.textContent);
    expect(headings.indexOf('Edit')).toBe(headings.indexOf('Record') + 1);
    expect(headings.indexOf('Review')).toBe(headings.indexOf('Edit') + 1);
    expect(within(screen.getAllByRole('group', { name: 'Review' })[0]).queryByRole('button', { name: /Editing/ })).toBeNull();
    fireEvent.click(within(edit).getByRole('button', { name: 'Editing' }));
    expect(navigate).toHaveBeenCalledWith('/editing');
  });

  it('route-and-rail: Editing is not gated (the page asks for a manuscript itself) and is active on a chapter', () => {
    renderShell({ hasManuscript: false, dawFileLinked: false });
    expect(screen.getAllByRole('button', { name: 'Editing' }).every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
    for (const hasManuscript of [true, false]) expect(shellPages({ hasManuscript, dawFileLinked: false }).map((page) => page.id)).toContain('/editing');
    cleanup();
    renderShell({ pathname: '/editing/chapter-1' });
    expect(screen.getAllByRole('button', { name: 'Editing' }).some((button) => button.getAttribute('aria-current') === 'page')).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Proof' }).every((button) => button.getAttribute('aria-current') !== 'page')).toBe(true);
  });

  // The engine panel replaces the Tracks page, so the Review group is Proof and Pickups only.
  it('has no Tracks item: the engine chip opens what it held', () => {
    renderShell();
    expect(screen.queryAllByRole('button', { name: 'Tracks' })).toHaveLength(0);
    const review = screen.getAllByRole('group', { name: 'Review' })[0];
    expect(
      within(review)
        .getAllByRole('button')
        .map((button) => button.textContent?.trim()),
    ).toEqual(['Proof', 'Pickups']);
  });

  // Pickups replaces the Tracks page's Pickups dialog, as its own item right after Proof in the Review group.
  it('lists Pickups in the Review group, after Proof', () => {
    renderShell();
    const review = screen.getAllByRole('group', { name: 'Review' })[0];
    const names = within(review)
      .getAllByRole('button')
      .map((button) => button.textContent?.trim());
    expect(names.slice(0, 2)).toEqual(['Proof', 'Pickups']);
  });

  it('opens /pickups from the Pickups item', () => {
    const navigate = vi.fn();
    renderShell({ navigate });
    fireEvent.click(screen.getAllByRole('button', { name: 'Pickups' })[0]);
    expect(navigate).toHaveBeenCalledWith('/pickups');
  });
});

// The engine chip replaces the REAPER pill, in place.
describe('AppShell engine chip', () => {
  it('is a button that opens the engine panel when no engine prop is given', () => {
    renderShell({ daw: 'REAPER', dawFileLinked: false });
    expect(screen.getByRole('button', { name: /^REAPER: / })).toBeTruthy();
  });

  it('shows "Built-in" and drops the link action when engine is builtin', () => {
    renderShell({ engine: 'builtin', daw: 'REAPER' });
    expect(screen.getByText('Built-in')).toBeTruthy();
    expect(screen.queryByText(/REAPER/)).toBeNull();
  });
});

// The Studio Next mock's top bar draws the crumb, the project name, the jump button, a zoom chip off 100% and the engine chip, and nothing else.
// Everything the header once carried is in the jump menu on its key (JumpMenu.test.tsx, App.test.tsx).
describe('AppShell header', () => {
  it('draws the old controls nowhere: no Back, Forward, Undo, History, zoom steps or zoom readout button', () => {
    renderShell({ zoom: { percent: 125, announcement: '' } });
    const header = screen.getByRole('banner');
    for (const name of ['Back', 'Forward', 'Undo', 'History', 'Zoom in', 'Zoom out', /Reset zoom/]) {
      expect(within(header).queryByRole('button', { name })).toBeNull();
    }
    expect(within(header).queryByRole('group', { name: 'Page history' })).toBeNull();
    expect(within(header).queryByRole('group', { name: 'Undo history' })).toBeNull();
    expect(within(header).queryByRole('group', { name: 'Zoom' })).toBeNull();
  });

  it('draws the project name as a "Switch project" button after the Project crumb, and it opens the picker', () => {
    const onSwitchProject = vi.fn();
    renderShell({ onSwitchProject });
    const header = screen.getByRole('banner');
    const project = within(header).getByRole('button', { name: 'Switch project (now Alice)' });
    expect(project.textContent).toBe('Alice');
    expect(within(header).getByText('Project').compareDocumentPosition(project) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(project);
    expect(onSwitchProject).toHaveBeenCalledTimes(1);
  });

  it('draws the folder icon beside the project name nowhere', () => {
    renderShell();
    expect(screen.getByRole('banner').querySelector('[data-icon="folder"]')).toBeNull();
  });

  it('orders the header: crumb, project, jump button, zoom chip, engine chip', () => {
    renderShell({ daw: 'REAPER', zoom: { percent: 125, announcement: '' } });
    const header = screen.getByRole('banner');
    const order = [
      within(header).getByText('Project'),
      within(header).getByRole('button', { name: /^Switch project/ }),
      within(header).getByRole('button', { name: /Jump to or run/ }),
      within(header).getByRole('button', { name: /^Zoom 125%/ }),
      within(header).getByRole('button', { name: /^REAPER: / }),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

// The mock's `zoomchip`: drawn only while zoom is not 100%, and it opens the jump menu at the zoom commands.
describe('AppShell zoom chip', () => {
  it('is not drawn at exactly 100%', () => {
    renderShell({ zoom: defaultZoom });
    expect(screen.queryByRole('button', { name: /^Zoom \d+%/ })).toBeNull();
  });

  it.each([50, 90, 110, 125, 200])('is drawn at %i% with the level, and opens the zoom commands', (percent) => {
    const onOpenZoomMenu = vi.fn();
    renderShell({ zoom: { percent, announcement: '' }, onOpenZoomMenu });
    const chip = screen.getByRole('button', { name: `Zoom ${percent}%: change in the jump menu` });
    expect(chip.textContent).toBe(`${percent}%`);
    fireEvent.click(chip);
    expect(onOpenZoomMenu).toHaveBeenCalledTimes(1);
  });

  it('keeps the polite live region mounted at 100% so the return to 100% is announced', () => {
    renderShell({ zoom: { percent: 100, announcement: 'Zoom 100%' } });
    expect(screen.getByText('Zoom 100%').getAttribute('aria-live')).toBe('polite');
  });

  it('announces a debounced level change politely', () => {
    renderShell({ zoom: { percent: 125, announcement: 'Zoom 125%' } });
    expect(screen.getByText('Zoom 125%').getAttribute('aria-live')).toBe('polite');
  });
});

// The running timer left the header: it is the Production page's chip beside Stop timer (pipeline.test.tsx, TimerChip.test.tsx).
describe('AppShell running-timer chip', () => {
  it('draws no timer chip in the header', () => {
    renderShell();
    expect(screen.queryByRole('timer')).toBeNull();
  });
});

describe('AppShell rail', () => {
  // The mock draws the product's name as "NARRATION / STUDIO"; the app once said "Console".
  it('names the product Studio, not Console', () => {
    const { container } = renderShell();
    expect(container.textContent).toContain('Studio');
    expect(container.textContent).not.toContain('Console');
  });

  it('draws a count badge on Proof and Pickups only when it is given one, and none on Story Bible', () => {
    renderShell({ navCounts: { proof: 14, pickups: 9 } });
    expect(screen.queryByRole('button', { name: /Story Bible, / })).toBeNull();
    expect(screen.getByRole('button', { name: 'Proof, 14' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pickups, 9' })).toBeTruthy();
  });

  it('draws no badge for a count that is missing or zero, and never on the other items', () => {
    renderShell({ navCounts: { proof: undefined } });
    expect(screen.queryByRole('button', { name: /Story Bible, / })).toBeNull();
    expect(screen.queryByRole('button', { name: /Proof, / })).toBeNull();
    expect(screen.queryByRole('button', { name: /Pickups, / })).toBeNull();
    expect(screen.queryByRole('button', { name: /(Script|Booth|Production|Master & QC), \d/ })).toBeNull();
  });
});

describe('AppShell header: jump', () => {
  it('opens the jump menu from the "Jump to or run…" button, which shows the key', () => {
    const onOpenJump = vi.fn();
    renderShell({ onOpenJump });
    const button = screen.getByRole('button', { name: /Jump to or run/ });
    expect(button.textContent).toContain('Ctrl');
    fireEvent.click(button);
    expect(onOpenJump).toHaveBeenCalledTimes(1);
  });

  it('draws none of these on the Booth', () => {
    renderShell({ pathname: '/booth' });
    expect(screen.queryByRole('button', { name: /Jump to or run/ })).toBeNull();
  });
});

describe('AppShell rail', () => {
  it('collapses below 1360 CSS px, not 1400', () => {
    const { container } = renderShell();
    const rail = container.querySelector('aside');
    expect(rail?.className).toContain('min-[1360px]');
    expect(container.innerHTML).not.toContain('1400px');
    expect(container.innerHTML).not.toContain('1399px');
  });

  it('keeps every item reachable by name in the one rail, which is also what the collapsed rail shows', () => {
    const { container } = renderShell();
    const rail = container.querySelector('aside') as HTMLElement;
    for (const name of ['Production', 'Script', 'Story Bible', 'Booth', 'Proof', 'Pickups', 'Master & QC', 'Delivery', 'Settings']) {
      expect(within(rail).getByRole('button', { name })).toBeTruthy();
    }
  });

  it('draws a count badge only from a count the host reported', () => {
    renderShell({ navCounts: { proof: 3 } });
    expect(screen.getAllByRole('button', { name: 'Proof, 3' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Master & QC, / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delivery, / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Pickups, / })).toBeNull();
  });

  // SN-M5: Delivery sits beside Master & QC in Finish, as the mock draws it.
  it('the-delivery-rail-item: Finish is Master & QC then Delivery, and Delivery opens /delivery', () => {
    const navigate = vi.fn();
    renderShell({ navigate });
    const finish = screen.getAllByRole('group', { name: 'Finish' })[0];
    expect(
      within(finish)
        .getAllByRole('button')
        .map((button) => button.textContent?.trim()),
    ).toEqual(['Master & QC', 'Delivery']);
    fireEvent.click(within(finish).getByRole('button', { name: 'Delivery' }));
    expect(navigate).toHaveBeenCalledWith('/delivery');
  });

  it('the-delivery-rail-item: "Go to Delivery" is listed with or without a manuscript, off with the reason when there is none', () => {
    expect(shellPages({ hasManuscript: true, dawFileLinked: false })).toContainEqual({ id: '/delivery', label: 'Delivery' });
    expect(shellPages({ hasManuscript: false, dawFileLinked: false })).toContainEqual({
      id: '/delivery',
      label: 'Delivery',
      disabledReason: 'Import a manuscript to unlock this page.',
    });
  });
});
