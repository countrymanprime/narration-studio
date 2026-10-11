// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contextItemsFor } from '../../../../registries/context';
import { useBookmarkContextMenu } from './bookmarkContextMenu';

afterEach(cleanup);

function Page({ onRemove, onClick }: { onRemove: (id: string) => void; onClick: () => void }) {
  useBookmarkContextMenu(onRemove);
  return (
    <div>
      <button type="button" data-bm="b9" onClick={onClick}>
        <svg data-testid="icon" />
      </button>
      <button type="button">other</button>
    </div>
  );
}

describe('bookmark right-click menu', () => {
  it('right-click-menu: matches a ribbon and offers Edit and Delete', () => {
    const onRemove = vi.fn();
    const onClick = vi.fn();
    render(<Page onRemove={onRemove} onClick={onClick} />);
    const items = contextItemsFor(screen.getByTestId('icon') as unknown as Element);
    expect(items?.map((i) => i.label)).toEqual(['Edit bookmark', 'Delete bookmark']);
    items?.[0].onSelect();
    expect(onClick).toHaveBeenCalledOnce();
    items?.[1].onSelect();
    expect(onRemove).toHaveBeenCalledWith('b9');
  });

  it('matches nothing else, and nothing once unmounted', () => {
    const view = render(<Page onRemove={vi.fn()} onClick={vi.fn()} />);
    expect(contextItemsFor(screen.getByRole('button', { name: 'other' }))).toBeNull();
    const ribbon = view.container.querySelector('[data-bm]')!;
    view.unmount();
    expect(contextItemsFor(ribbon)).toBeNull();
  });
});
