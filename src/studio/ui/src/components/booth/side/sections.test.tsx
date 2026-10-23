// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { boothSections, registerBoothSection } from './sections';
import { BoothSidePanel } from './BoothSidePanel';
import { sideData } from './fixture';

afterEach(cleanup);

describe('sections are a registry', () => {
  it('registers the panel sections in the mock order', () => {
    render(
      <ApiProvider api={createMockApi()}>
        <BoothSidePanel data={sideData()} open drawer={false} onOpenChange={() => undefined} />
      </ApiProvider>,
    );
    expect(boothSections().map((s) => s.id)).toEqual(['reference', 'suspected', 'last-punch', 'voices', 'coming-up', 'numbers']);
    const text = screen.getByRole('complementary', { name: 'Side panel' }).textContent ?? '';
    expect(text.indexOf('Last punch')).toBeLessThan(text.indexOf('Voices in this scene'));
  });

  it('renders a section registered later at its order, with no edit here', () => {
    registerBoothSection('pickups', () => <div>Pickups · 2 open</div>, 20);
    registerBoothSection('bookmarks', () => <div>Bookmarks</div>, 65);
    render(
      <ApiProvider api={createMockApi()}>
        <BoothSidePanel data={sideData()} open drawer={false} onOpenChange={() => undefined} />
      </ApiProvider>,
    );
    const text = screen.getByRole('complementary', { name: 'Side panel' }).textContent ?? '';
    expect(text.indexOf('Pickups')).toBeLessThan(text.indexOf('Voices in this scene'));
    expect(text.indexOf('Coming up')).toBeLessThan(text.indexOf('Bookmarks'));
    expect(text.indexOf('Bookmarks')).toBeLessThan(text.indexOf('This session'));
  });
});
