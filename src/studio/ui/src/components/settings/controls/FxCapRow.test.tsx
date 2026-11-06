// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { StudioProvider } from '../../../studio/StudioProvider';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { TooltipProvider } from '../../primitives/Tooltip';
import { SettingsPage } from '../page/SettingsPage';
import { ROWS } from '../registry/rows';
import { search } from '../registry/search';

const DEFAULTS = JSON.parse(readFileSync(join(__dirname, '../../../../../../../config/defaults.json'), 'utf8')) as Record<string, Record<string, string>>;

afterEach(cleanup);

describe('the effects coverage cap setting (parity audit)', () => {
  it('is a computer row with a project override for the host’s Editing.fx_cap_pct under Effects, with its default, found by search', () => {
    const row = ROWS.find((candidate) => candidate.id === 'daw.fxCap');
    expect(row).toMatchObject({
      cat: 'recording',
      section: 'Effects',
      scope: 'both',
      unit: '%',
      field: { tool: 'Editing', key: 'fx_cap_pct' },
      used: ['editing'],
    });
    expect(row?.def).toBe(DEFAULTS.Editing?.fx_cap_pct);
    for (const query of ['effects cap', 'coverage cap', 'effects warning']) expect(search(query).some((hit) => hit.row?.id === 'daw.fxCap')).toBe(true);
  });

  it('saves the computer’s cap and a project’s own cap through the host, the project one as the Effects tab does', async () => {
    const api = createMockApi({}, { daw: {} });
    const save = vi.spyOn(api, 'saveSettings');
    const data = await api.bootstrap();
    render(
      <MemoryRouter>
        <ThemeProvider>
          <ApiProvider api={api}>
            <StudioProvider>
              <TooltipProvider>
                <main tabIndex={-1}>
                  <SettingsPage
                    data={data}
                    notify={vi.fn()}
                    onDirtyChange={vi.fn()}
                    registerActions={vi.fn()}
                    onProjectDataCleared={async () => undefined}
                    onLinkDawFile={vi.fn()}
                    go={vi.fn()}
                    refreshBootstrap={async () => undefined}
                  />
                </main>
              </TooltipProvider>
            </StudioProvider>
          </ApiProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Settings categories' });
    fireEvent.click(within(nav).getByRole('button', { name: /^Recording & DAW/ }));
    const row = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-row="daw.fxCap"]');
      expect(found).toBeTruthy();
      return found!;
    });
    const box = await within(row).findByRole('textbox');
    fireEvent.change(box, { target: { value: '25' } });
    fireEvent.blur(box);
    await waitFor(() => expect(save).toHaveBeenCalledWith('Editing', 'global', { fx_cap_pct: '25' }));
    // This project may use its own cap: the value the Effects tab's strip edits.
    fireEvent.click(await within(row).findByRole('button', { name: 'Override for this project: Effects coverage cap' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('Editing', 'project', { fx_cap_pct: '25' }));
  });
});
