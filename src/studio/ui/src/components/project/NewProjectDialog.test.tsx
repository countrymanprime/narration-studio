// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewProjectDialog } from './NewProjectDialog';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { brand } from '../../brand.gen';

afterEach(cleanup);

function renderDialog(overrides: Parameters<typeof createMockApi>[0] = {}) {
  const api = createMockApi(overrides);
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(
    <ApiProvider api={api}>
      <NewProjectDialog onClose={onClose} onCreated={onCreated} />
    </ApiProvider>,
  );
  return { api, onClose, onCreated };
}

describe('NewProjectDialog', () => {
  it('is a dialog titled New Project with a Name field focused', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'New Project' })).toBeTruthy();
    expect(screen.getByLabelText('Name')).toBe(document.activeElement);
  });

  it('disables Create until a name is entered', () => {
    renderDialog();
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alice' } });

    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('creates the project with an empty parent by default, so the host uses its default projects directory', async () => {
    const createProject = vi.fn(async () => ({ switched: true }));
    const { onCreated } = renderDialog({ createProject });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alice' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createProject).toHaveBeenCalledWith('', 'Alice'));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ switched: true }));
  });

  it('creates the project when Enter is pressed in the Name field, and not while the name is empty (#1778)', async () => {
    const createProject = vi.fn(async () => ({ switched: true }));
    const { onCreated } = renderDialog({ createProject });
    fireEvent.submit(screen.getByLabelText('Name').closest('form')!);
    expect(createProject).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alice' } });
    fireEvent.submit(screen.getByLabelText('Name').closest('form')!);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(createProject).toHaveBeenCalledWith('', 'Alice');
  });

  it('says the name rules before Create, and the Name field is described by them (#1778)', () => {
    renderDialog();
    const rules = screen.getByText(/can't contain/i);
    expect(rules.textContent).toContain('< > : " / \\ | ? *');
    expect(rules.textContent).toMatch(/end with a period/i);
    expect(rules.textContent).toMatch(/CON, NUL or COM1/);
    expect(screen.getByLabelText('Name').getAttribute('aria-describedby')).toContain(rules.id);
  });

  it('trims surrounding whitespace from the name before creating', async () => {
    const createProject = vi.fn(async () => ({ switched: true }));
    renderDialog({ createProject });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Alice  ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createProject).toHaveBeenCalledWith('', 'Alice'));
  });

  it('shows the real default projects folder until another location is chosen', async () => {
    renderDialog({ projectDefaultLocation: async () => ({ path: `C:/Users/Alice/${brand.identity.defaultProjectsFolder}` }) });

    const path = `C:/Users/Alice/${brand.identity.defaultProjectsFolder}`;
    // The path is drawn in pieces, a break after each separator (XPJ-9), so it is found by its whole text.
    const shown = await screen.findByText((_, node) => node?.className === '[overflow-wrap:anywhere]' && node.textContent === path);
    expect(shown.querySelectorAll('wbr')).toHaveLength(path.split('/').length);
    expect(screen.getByText(/default projects folder/)).toBeTruthy();
  });

  it('puts Cancel beside Create at the end of the footer (XPJ-5)', () => {
    renderDialog();
    const footer = screen.getByRole('button', { name: 'Cancel' }).parentElement!;
    expect(footer.className).not.toContain('first-child:not(:only-child)]:mr-auto');
    expect(footer.contains(screen.getByRole('button', { name: 'Create' }))).toBe(true);
  });

  it('still offers Change location when the default folder cannot be read', async () => {
    const projectDefaultLocation = vi.fn(async () => {
      throw new Error('no home');
    });
    renderDialog({ projectDefaultLocation });

    await waitFor(() => expect(projectDefaultLocation).toHaveBeenCalled());
    expect(screen.getByText('the default projects folder')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change location…' })).toBeTruthy();
  });

  it('uses the folder chosen through Change location as the parent', async () => {
    const createProject = vi.fn(async () => ({ switched: true }));
    const selectProjectFolder = vi.fn(async () => ({ selected: true, path: 'C:/Elsewhere' }));
    renderDialog({ createProject, selectProjectFolder });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alice' } });

    fireEvent.click(screen.getByRole('button', { name: /Change location/ }));
    await waitFor(() => expect(selectProjectFolder).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createProject).toHaveBeenCalledWith('C:/Elsewhere', 'Alice'));
  });

  it('leaves the parent unchanged when Change location is cancelled', async () => {
    const createProject = vi.fn(async () => ({ switched: true }));
    const selectProjectFolder = vi.fn(async () => ({ selected: false }));
    renderDialog({ createProject, selectProjectFolder });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alice' } });

    fireEvent.click(screen.getByRole('button', { name: /Change location/ }));
    await waitFor(() => expect(selectProjectFolder).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createProject).toHaveBeenCalledWith('', 'Alice'));
  });

  it('shows a refusal reason and does not close when the create is refused', async () => {
    const createProject = vi.fn(async () => ({ switched: false, reason: 'The app is busy.' }));
    const { onCreated, onClose } = renderDialog({ createProject });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alice' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('The app is busy.')).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('surfaces a rejected create call as visible text instead of failing silently', async () => {
    const createProject = vi.fn(async () => {
      throw new Error('the desktop host is not ready');
    });
    renderDialog({ createProject });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alice' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Error: the desktop host is not ready')).toBeTruthy();
  });

  it('calls onClose when Cancel is clicked', () => {
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
  });
});
