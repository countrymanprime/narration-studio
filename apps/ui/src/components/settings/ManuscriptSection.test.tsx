// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import type { NarrationApi } from '../../types';
import { ThemeProvider } from '../../theme/ThemeContext';
import { SettingsPage } from './page/SettingsPage';

afterEach(cleanup);

async function renderManuscript(options: { noManuscript?: boolean; replace?: boolean; prepare?: (api: NarrationApi) => void } = {}) {
  const api = createMockApi({}, options.noManuscript ? { noManuscript: true } : {});
  if (options.replace) {
    // The mock host's preview does not flag a reset; the real host does when a manuscript exists.
    const preview = api.manuscriptImportPreview;
    api.manuscriptImportPreview = async (id, opts) => ({ ...(await preview(id, opts)), requiresReset: true });
  }
  options.prepare?.(api);
  const data = await api.bootstrap();
  render(
    <MemoryRouter>
      <ThemeProvider>
        <ApiProvider api={api}>
          <SettingsPage
            data={data}
            notify={vi.fn()}
            onDirtyChange={vi.fn()}
            registerActions={vi.fn()}
            onProjectDataCleared={async () => undefined}
            onLinkDawFile={vi.fn()}
            go={vi.fn()}
            refreshBootstrap={async () => undefined}
            initialCategory="Manuscript"
          />
        </ApiProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  return api;
}

describe('Settings > Manuscript', () => {
  it('settings-has-a-manuscript-category-with-replace: Replace manuscript when one exists', async () => {
    await renderManuscript();
    expect(await screen.findByRole('button', { name: 'Replace manuscript' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Import manuscript' })).toBeNull();
  });

  it('settings-has-a-manuscript-category-with-replace: Import manuscript when none does', async () => {
    await renderManuscript({ noManuscript: true });
    expect(await screen.findByRole('button', { name: 'Import manuscript' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Replace manuscript' })).toBeNull();
  });

  it('replace-opens-the-existing-flow: the button opens the import review through the host, naming what a replace clears', async () => {
    await renderManuscript({ replace: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Replace manuscript' }));
    const dialog = await screen.findByRole('alertdialog', { name: /^Import / });
    // confirmation-lists-what-a-replace-clears (no bookmark count until the bookmarks binding exists, SN-B5)
    expect(within(dialog).getByText(/clears Story Bible, notes, bookmarks, statuses, and saved comparison results/)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Replace and reset' })).toBeTruthy();
    // replace-does-not-ask-for-the-delivery-profile
    expect(within(dialog).queryByRole('combobox', { name: 'Delivery profile' })).toBeNull();
  });

  it('replace commits with the reset confirmed', async () => {
    let commit = vi.fn();
    await renderManuscript({ replace: true, prepare: (api) => void (commit = vi.spyOn(api, 'manuscriptImportCommit')) });
    fireEvent.click(await screen.findByRole('button', { name: 'Replace manuscript' }));
    const dialog = await screen.findByRole('alertdialog', { name: /^Import / });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace and reset' }));
    await waitFor(() => expect(commit).toHaveBeenCalled());
    expect(commit.mock.calls[0]?.[1].confirmedReset).toBe(true);
  });
});

describe('one implementation of the flow', () => {
  it('replace-opens-the-existing-flow-not-a-copy: only ManuscriptImport calls the import bindings', () => {
    const root = join(__dirname, '..', '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) && !path.includes(`${join(root, 'api')}`)) files.push(path);
      }
    };
    walk(join(root, 'components'));
    const callers = files.filter((file) =>
      /api\.manuscriptImportStart\(|api\.manuscriptImportCommit\(|api\.selectManuscript\(/.test(readFileSync(file, 'utf8')),
    );
    expect(callers.map((file) => file.slice(root.length + 1))).toEqual(['components/production/ManuscriptImport.tsx']);
  });
});
