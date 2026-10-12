// @vitest-environment jsdom
// Find in the manuscript (the mock's EntryEditor, SN-B92 G8): a button in the entry's header opens the Script page's Find on the entry's name.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../api/ApiContext';
import { createMockApi } from '../../api/mockApi';
import { WIRE_ENTITIES } from '../../api/mockFixtures';
import { readFindQuery } from '../script/page/scriptQuery';
import { GuideDetail } from './GuideDetail';

afterEach(() => cleanup());

const Script = () => {
  const { pathname, search } = useLocation();
  return <p data-testid="script">{`${pathname}|${readFindQuery(new URLSearchParams(search))}`}</p>;
};

describe('Find in the manuscript', () => {
  it("opens the Script's Find with the name", () => {
    const hatter = WIRE_ENTITIES.find((row) => row.id === 'mad-hatter')!;
    render(
      <MemoryRouter initialEntries={['/story-bible']}>
        <ApiProvider api={createMockApi()}>
          <Routes>
            <Route
              path="/story-bible"
              element={<GuideDetail entity={hatter} entities={WIRE_ENTITIES} reload={vi.fn()} notify={vi.fn()} goToManuscript={vi.fn()} />}
            />
            <Route path="/script" element={<Script />} />
          </Routes>
        </ApiProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Find in the manuscript' }));
    expect(screen.getByTestId('script').textContent).toBe('/script|Hatter');
  });

  it('is in the header of the read view and of the edit view', () => {
    const alice = WIRE_ENTITIES.find((row) => row.id === 'alice')!;
    render(
      <MemoryRouter>
        <ApiProvider api={createMockApi()}>
          <GuideDetail entity={alice} entities={WIRE_ENTITIES} reload={vi.fn()} notify={vi.fn()} goToManuscript={vi.fn()} />
        </ApiProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Find in the manuscript' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this entry' }));
    expect(screen.getByRole('button', { name: 'Find in the manuscript' })).toBeTruthy();
  });
});
