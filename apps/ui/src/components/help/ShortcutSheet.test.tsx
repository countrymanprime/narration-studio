// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ShortcutSheet } from './ShortcutSheet';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { COMMAND_CATALOG, type CommandDescriptor } from '../../input/commands.catalog';
import { commandsFor } from '../../input/surfaces';
import type { NarrationApi, ScopedSettingField } from '../../types';
import { CommandRouter } from '../../input/router';
import { useCommand } from '../../input/useCommand';

afterEach(cleanup);

function overridesApi(bindings: Record<string, string[]>): NarrationApi {
  const base = createMockApi();
  return {
    ...base,
    settingsForScope: async (scope) => {
      const all = await base.settingsForScope(scope);
      const field = all.Keymap?.find((entry) => entry.key === 'overrides') as ScopedSettingField;
      return { ...all, Keymap: [{ ...field, effectiveValue: JSON.stringify({ version: 1, bindings }) }] };
    },
  };
}

function renderSheet(onClose = vi.fn(), onShowAll = vi.fn(), options: { api?: NarrationApi; catalog?: readonly CommandDescriptor[] } = {}) {
  render(
    <ApiProvider api={options.api ?? createMockApi()}>
      <CommandRouter>
        <ShortcutSheet onClose={onClose} onShowAll={onShowAll} catalog={options.catalog} />
      </CommandRouter>
    </ApiProvider>,
  );
  return { onClose, onShowAll };
}

describe('ShortcutSheet', () => {
  it('closes on a press outside the sheet: it is reference material with nothing to lose (issue 1706)', async () => {
    const { onClose } = renderSheet();
    await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    fireEvent.click(document.querySelector('[data-dialog-backdrop]') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is a modal dialog named "Keyboard shortcuts"', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  });

  it('sheet-lists-the-help-surface: lists exactly the rows of commandsFor("help"), and a new help row appears with no other edit', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const labels = within(dialog)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('span')!.textContent);
    expect(labels.sort()).toEqual(
      commandsFor('help')
        .map((command) => command.label)
        .sort(),
    );
    cleanup();

    const fake: CommandDescriptor = {
      id: 'test.fake',
      label: 'A fake help row',
      scope: 'page',
      defaults: [{ source: 'keyboard', code: 'KeyQ', modifiers: [] }],
      surfaces: ['help'],
    };
    const hidden: CommandDescriptor = { id: 'test.hidden', label: 'Not on the sheet', scope: 'page', defaults: [], surfaces: ['settings'] };
    renderSheet(vi.fn(), vi.fn(), { catalog: [...COMMAND_CATALOG, fake, hidden] });
    const again = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(again).getByText('A fake help row')).toBeTruthy();
    expect(within(again).queryByText('Not on the sheet')).toBeNull();
  });

  it('sheet-shows-the-remapped-keys: shows the override and not the default, and the default when there is none', async () => {
    renderSheet(vi.fn(), vi.fn(), { api: overridesApi({ 'nav.back': ['Ctrl+KeyH'] }) });
    const row = screen.getByText('Back').closest('li')!;
    await waitFor(() => expect(within(row).getAllByRole('img', { name: 'Ctrl + H' }).length).toBeGreaterThan(0));
    expect(within(row).queryAllByRole('img', { name: 'Browser Back' })).toHaveLength(0);
    cleanup();

    renderSheet();
    const plain = screen.getByText('Back').closest('li')!;
    expect(within(plain).getAllByRole('img', { name: 'Browser Back' }).length).toBeGreaterThan(0);
  });

  it('sheet-draws-caps: arrows, Space and Esc are glyph caps that keep their names for a screen reader', () => {
    renderSheet();
    const wordRow = screen.getByText('Previous word').closest('li')!;
    expect(wordRow.querySelector('kbd[data-key="ArrowLeft"]')).not.toBeNull();
    expect(within(wordRow).getByText('Left arrow')).toBeTruthy();
    const readingRow = screen.getByText('Record or stop').closest('li')!;
    expect(readingRow.querySelector('kbd[data-key="Space"]')).not.toBeNull();
  });

  it('draws the right-click and Enter caps', () => {
    renderSheet();
    const keepRow = screen.getByText(/^Keep the take the keys are on/).closest('li')!;
    expect(keepRow.querySelector('kbd[data-key="Enter"]')).not.toBeNull();
    const rollRow = screen.getByText('Punch and roll from here').closest('li')!;
    const click = rollRow.querySelector('kbd[data-key="RightClick"]');
    expect(click).not.toBeNull();
    expect(within(click as HTMLElement).getByText('Right-click')).toBeTruthy();
    expect(within(rollRow).getByText('Start from here')).toBeTruthy();
  });

  it('groups commands under a heading per scope, skipping a scope with no commands', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByRole('heading', { name: 'Global' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Page' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Booth' })).toBeTruthy();
    // Nothing in the catalog is scoped `dialog` yet, so that heading is left out rather than drawn empty.
    expect(within(dialog).queryByRole('heading', { name: 'Dialog' })).toBeNull();
  });

  it("shows Back's three default gestures as key caps, and reading.toggle's Space", () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const backRow = within(dialog).getByText('Back').closest('li')!;
    expect(within(backRow).getByRole('img', { name: 'Alt + ←' })).toBeTruthy();
    // A text cap is a `Kbd` image inside the way's own image; a screen reader reads only the outer one.
    expect(within(backRow).getAllByRole('img', { name: 'Browser Back' }).length).toBeGreaterThan(0);
    const readingRow = within(dialog).getByText('Record or stop').closest('li')!;
    expect(within(readingRow).getByRole('img', { name: 'Space' })).toBeTruthy();
  });

  it('shows its own "?" shortcut as Shift plus the physical Slash key, not the character it types', () => {
    renderSheet();
    const row = screen.getByText('Show keyboard shortcuts').closest('li')!;
    expect(within(row).getByRole('img', { name: 'Shift + /' })).toBeTruthy();
  });

  it('closes from the header Close button and calls onClose', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape', () => {
    const { onClose } = renderSheet();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('"Show all shortcuts" calls onShowAll, the link to Settings', () => {
    const { onShowAll } = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Show all shortcuts' }));
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it("claims the router's dialog scope while open, so nav.back (global) no longer matches until it closes (ADR 0361 decision 4)", () => {
    function Harness({ backHandler }: { backHandler: () => void }) {
      const [open, setOpen] = useState(true);
      useCommand('nav.back', backHandler);
      return open ? <ShortcutSheet onClose={() => setOpen(false)} onShowAll={() => {}} /> : null;
    }
    const backHandler = vi.fn();
    render(
      <ApiProvider api={createMockApi()}>
        <CommandRouter>
          <Harness backHandler={backHandler} />
        </CommandRouter>
      </ApiProvider>,
    );
    fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
    expect(backHandler).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'ArrowLeft', code: 'ArrowLeft', altKey: true });
    expect(backHandler).toHaveBeenCalledOnce();
  });
});

describe('no-hand-written-list', () => {
  it.each(['ShortcutSheet.tsx', '../settings/KeyboardPanel.tsx'])('%s reads commandsFor, not COMMAND_CATALOG', (file) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    expect(source).not.toMatch(/\bCOMMAND_CATALOG\b/);
  });
});
