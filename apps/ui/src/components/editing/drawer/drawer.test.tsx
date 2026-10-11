// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useRef, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { DawCapabilities } from '../../../api/contracts/daw';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS } from '../../../fixtures/daw';
import { providedCommands } from '../../../input/commandProviders';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { EditingPageProvider } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import { StripRoot } from '../strip/TimelineStrip';
import { Drawer } from './Drawer';
import { DrawerLayout } from './DrawerLayout';
import { registerDrawerSection } from './drawerSections';
import { backupsOffered, resolveTab, STRIP_MIN_WIDTH, tabsFor } from './drawerTabs';
import { useBackupsOffered, useDrawerState, useStripFits } from './useDrawer';
import { useDrawerCommands } from './useDrawerCommands';

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
  const root = useRef<HTMLDivElement>(null);
  const fits = useStripFits(root);
  const backups = useBackupsOffered();
  const d = useDrawerState(fits, backups);
  useDrawerCommands(d.offered, d.openTab);
  return (
    <div ref={root} style={{ width }} className="@container" data-width={width}>
      <button type="button" id="drawertoggle" onClick={d.toggle}>
        Toggle
      </button>
      {children}
      <DrawerLayout
        open={d.open}
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
            strip={{ passage: null, playingId: null, onPlay: () => {}, chapterId: '5' }}
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
          <StripRoot>
            <Harness width={width} onReview={onReview} />
          </StripRoot>
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
    expect(slot.className).toContain('@min-[1281px]:static');
    cleanup();
    mount(1440);
    await open();
    expect(document.querySelector('[data-drawer-open]')!.className).toContain('@min-[1281px]:grid-cols-[minmax(0,1fr)_352px]');
  });
});

describe('timeline-tab-hosts-the-strip-below-1360', () => {
  it('is a tab below 1360 and renders the strip', async () => {
    mount(STRIP_MIN_WIDTH - 1);
    await open();
    await waitFor(() => expect(tabNames()).toHaveLength(4));
    await userEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(document.querySelector('#drawer #timeline')).not.toBeNull();
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

describe('jump-menu-commands', () => {
  it('offers Editing: Clean up, Effects and Backups (when offered) and each opens the drawer on its tab', async () => {
    mount(1280);
    await waitFor(() => expect(providedCommands().map((c) => c.label)).toEqual(['Editing: Clean up', 'Editing: Effects', 'Editing: Backups']));
    act(() =>
      providedCommands()
        .find((c) => c.label === 'Editing: Effects')!
        .run(),
    );
    expect(screen.getByRole('tab', { name: /Effects/ }).getAttribute('aria-selected')).toBe('true');
    cleanup();
    mount(1280, withBackups('unsupported'));
    expect(providedCommands().map((c) => c.label)).toEqual(['Editing: Clean up', 'Editing: Effects']);
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
