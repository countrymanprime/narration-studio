// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { EditingPageProvider } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import { Drawer } from './Drawer';
import { DrawerLayout } from './DrawerLayout';
import { registerDrawerSection } from './drawerSections';
import { backupsOffered, resolveTab, STRIP_MIN_WIDTH, tabsFor } from './drawerTabs';
import { useBackupsOffered, useDrawerState, useStripFits } from './useDrawer';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

const doc = marksDoc();
const withBackups = (level: 'supported' | 'unsupported', reason?: 'turned_off'): DawCapabilities => ({
  ...DAW_SETUPS.reaper,
  capabilities: { ...DAW_SETUPS.reaper.capabilities, backups: { level, available: level === 'supported' && !reason, ...(reason ? { reason } : {}) } },
});

/** Stands in for the page: it owns the drawer state, the way the Editing page will. */
function Harness({ width, onReview = () => {}, children }: { width: number; onReview?: (k: never) => void; children?: ReactNode }) {
  const fits = useStripFits();
  const backups = useBackupsOffered();
  const d = useDrawerState(fits, backups);
  return (
    <div style={{ width }} data-width={width}>
      <button type="button" id="drawertoggle" onClick={d.toggle}>
        Toggle
      </button>
      {children}
      <DrawerLayout
        open={d.open}
        onClose={d.close}
        drawer={
          <Drawer
            doc={doc}
            chapterId="5"
            tab={d.tab}
            tabs={d.offered}
            onTab={d.setTab}
            onClose={d.close}
            flagKind={null}
            onReview={onReview as never}
            strip={{ passage: null, playingId: null, onPlay: () => {} }}
          />
        }
      >
        <p>The text</p>
      </DrawerLayout>
    </div>
  );
}

function mount(width: number, caps?: DawCapabilities, onReview?: (k: never) => void) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() {
        this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as never);
      }
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width } as DOMRect);
  const dawCaps = caps ?? withBackups('supported');
  return render(
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw: createMockDawClient(dawCaps) }}>
        <EditingPageProvider doc={doc}>
          <Harness width={width} onReview={onReview} />
        </EditingPageProvider>
      </PortOverrides>
    </ApiProvider>,
  );
}

const open = async () => {
  await userEvent.click(screen.getByText('Toggle'));
};
const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent);

describe('tabs-follow-the-capabilities', () => {
  it('offers Clean up and Effects always, Backups with the capability, Timeline only below the strip width', () => {
    expect(tabsFor(false, true).map(([k]) => k)).toEqual(['cleanup', 'effects']);
    expect(tabsFor(true, true).map(([k]) => k)).toEqual(['cleanup', 'effects', 'backups']);
    expect(tabsFor(true, false).map(([k]) => k)).toEqual(['cleanup', 'effects', 'backups', 'timeline']);
    expect(backupsOffered(withBackups('unsupported'))).toBe(false);
    expect(backupsOffered(withBackups('supported', 'turned_off'))).toBe(false);
    expect(backupsOffered(null)).toBe(false);
  });
  it('wears a count on every label but the timeline', async () => {
    mount(1280);
    await open();
    await waitFor(() => expect(tabNames()).toHaveLength(4));
    expect(tabNames()).toEqual(['Clean up · 4', 'Effects · 0', 'Backups · 0', 'Timeline']);
  });
  it('leaves Backups out when the DAW has none', async () => {
    mount(1280, withBackups('unsupported'));
    await open();
    expect(tabNames()).toEqual(['Clean up · 4', 'Effects · 0', 'Timeline']);
  });
});

describe('arrow-keys-move-between-tabs-and-focus-follows', () => {
  it('cycles with Left and Right, wrapping, the open tab selected and the panel named by it', async () => {
    mount(1280);
    await open();
    await waitFor(() => expect(tabNames()).toHaveLength(4));
    const tabs = screen.getAllByRole('tab');
    act(() => tabs[0].focus());
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('tabindex')).toBe('-1');
    await userEvent.keyboard('{ArrowRight}');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[1]);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(tabs[1].id);
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(tabs[3].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs[3]);
  });
});

describe('opens-closes-and-keeps-the-tab', () => {
  it('toggles from the header button and the close button, and reopens on the last tab', async () => {
    mount(1280);
    await open();
    await waitFor(() => expect(tabNames()).toHaveLength(4));
    await userEvent.click(screen.getByRole('tab', { name: /Effects/ }));
    await userEvent.click(document.querySelector<HTMLElement>('#drawerclose')!);
    expect(document.querySelector('#drawer')).toBeNull();
    await open();
    expect(screen.getByRole('tab', { name: /Effects/ }).getAttribute('aria-selected')).toBe('true');
    await open();
    expect(document.querySelector('#drawer')).toBeNull();
  });
  it('falls back to Clean up when the tab is no longer offered', () => {
    const offered = tabsFor(true, false);
    expect(resolveTab('timeline', offered)).toBe('timeline');
    expect(resolveTab('timeline', tabsFor(true, true))).toBe('cleanup');
    expect(resolveTab('backups', tabsFor(false, true))).toBe('cleanup');
  });
});

describe('layout-by-width', () => {
  it('is an overlay on the text at 1280 and a column beside it at 1440', async () => {
    mount(1280);
    await open();
    const slot = document.querySelector('[data-drawer-slot]')!;
    expect(slot.className).toContain('absolute');
    expect(slot.className).toContain('min-[1281px]:static');
    expect(slot.className).not.toContain('@');
    cleanup();
    mount(1440);
    await open();
    expect(document.querySelector('[data-drawer-open]')!.className).toContain(' min-[1281px]:grid-cols-[minmax(0,1fr)_352px]');
  });

  // Alignment audit cause O: over the text the drawer cut lines mid-word with nothing to say they were behind it.
  it('dims the text under the overlay drawer, and a press on the dim closes it', async () => {
    mount(1280);
    await open();
    const scrim = document.querySelector<HTMLElement>('[data-scrim]')!;
    expect(scrim.className).toContain('bg-[var(--panel-scrim)]');
    expect(scrim.className).toContain('min-[1281px]:hidden');
    expect(scrim.getAttribute('aria-hidden')).toBe('true');
    await userEvent.setup().click(scrim);
    expect(document.querySelector('[data-drawer-slot]')).toBeNull();
    expect(document.querySelector('[data-scrim]')).toBeNull();
  });
});

describe('the drawer frame', () => {
  // Alignment audit XED-15: the last section's rule floated in the empty half of the panel.
  it('draws no rule under the last section', async () => {
    const off = registerDrawerSection({ tab: 'cleanup', order: 99, label: 'Probe', render: () => <p>probe</p> });
    mount(1440);
    await open();
    expect(screen.getByRole('region', { name: 'Probe' }).className).toContain('last:border-b-0');
    off();
  });

  // Alignment audit XED-34: the drawer's header sat 4 px above the page card's header beside it.
  it('pads its header 12 px at the top, as the page card does', async () => {
    mount(1440);
    await open();
    const head = document.querySelector('#drawer h2')!.parentElement!;
    expect(head.className).toContain('pt-3');
    expect(head.className).not.toContain('py-2');
  });
});

describe('timeline-tab-hosts-the-strip-below-1360', () => {
  it('is a tab below 1360 and renders the strip', async () => {
    mount(STRIP_MIN_WIDTH - 1);
    await open();
    await waitFor(() => expect(tabNames()).toHaveLength(4));
    await userEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(document.querySelector('#drawer #timeline')).not.toBeNull();
    // In the drawer the strip shows at the width the tab is offered at; jsdom draws no CSS, so the class is what is checked.
    expect(document.querySelector('#drawer #timeline')!.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });
  it('is not offered at 1360 and a drawer left on it falls back', async () => {
    mount(STRIP_MIN_WIDTH);
    await open();
    await waitFor(() => expect(tabNames()).toEqual(['Clean up · 4', 'Effects · 0', 'Backups · 0']));
    expect(screen.getByRole('tab', { name: /Clean up/ }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('found-list-steps-through-never-edits', () => {
  it('lists the four kinds with counts, disables an empty kind, and Review hands the kind to the page', async () => {
    const onReview = vi.fn();
    mount(1280, undefined, onReview);
    await open();
    const found = screen.getByRole('region', { name: 'Found in this chapter' });
    const rows = within(found).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    const buttons = within(found).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Review', 'Review', 'Review', 'Review']);
    for (const kind of ['extra', 'miss', 'mis', 'low'] as const) {
      const row = found.querySelector(`[data-found="${kind}"]`)!;
      const button = within(row as HTMLElement).getByRole('button');
      if (doc.counts[kind] === 0) {
        expect((button as HTMLButtonElement).disabled).toBe(true);
      } else {
        fireEvent.click(button);
        expect(onReview).toHaveBeenLastCalledWith(kind);
      }
    }
    expect(within(found).queryByRole('textbox')).toBeNull();
  });
  it('leads each row with the kind’s swatch, drawn by the registry’s mark', async () => {
    mount(1280);
    await open();
    const found = screen.getByRole('region', { name: 'Found in this chapter' });
    for (const [kind, shape] of [
      ['extra', 'extra'],
      ['miss', 'missing'],
      ['mis', 'misread'],
      ['low', 'low'],
    ] as const) {
      const swatch = found.querySelector(`[data-found="${kind}"] [data-swatch="${kind}"] mark`);
      expect(swatch?.getAttribute('data-kind'), kind).toBe(shape);
    }
  });
});

describe('sections-register-by-tab-and-order', () => {
  it('draws sections in order inside their tab, removes one, and drops a throwing one', async () => {
    const off = [
      registerDrawerSection({ tab: 'effects', order: 20, label: 'Second', render: () => <p>second</p> }),
      registerDrawerSection({ tab: 'effects', order: 10, label: 'First', render: () => <p>first</p> }),
      registerDrawerSection({
        tab: 'effects',
        order: 15,
        label: 'Broken',
        render: () => {
          throw new Error('boom');
        },
      }),
    ];
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount(1280);
    await open();
    await userEvent.click(screen.getByRole('tab', { name: /Effects/ }));
    const panel = screen.getByRole('tabpanel');
    expect(
      within(panel)
        .getAllByRole('region')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['First', 'Second']);
    expect(log).toHaveBeenCalled();
    off.forEach((f) => f());
    cleanup();
    mount(1280);
    await open();
    await userEvent.click(screen.getByRole('tab', { name: /Effects/ }));
    expect(within(screen.getByRole('tabpanel')).queryAllByRole('region')).toHaveLength(0);
  });
});

describe('atlas-and-axe', () => {
  it('names the drawer and its tablist, and has no axe violations', async () => {
    const { container } = mount(1280);
    await open();
    expect(screen.getByRole('complementary', { name: 'Clean up and effects' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Drawer' })).toBeTruthy();
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });
});
