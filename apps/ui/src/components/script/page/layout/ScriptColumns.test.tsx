// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScriptColumns, type Drawer } from './ScriptColumns';

afterEach(cleanup);

function mount(drawer: Drawer, onClose = vi.fn()) {
  render(
    <div>
      <aside aria-label="Primary navigation">
        <a href="#nav">Production</a>
      </aside>
      <button aria-expanded={drawer === 'ch'}>Chapters</button>
      <ScriptColumns drawer={drawer} onClose={onClose} chapters={<button>Chapter one</button>} reader={<p>Reader</p>} rail={<button>Rail tool</button>} />
      <div role="menu" data-base-ui-portal="">
        <button>Menu from the drawer</button>
      </div>
    </div>,
  );
  return onClose;
}

describe('ScriptColumns drawers', () => {
  it('draw inside the columns, not fixed to the viewport, so they never cover the navigation rail', () => {
    mount('ch');
    const panel = document.querySelector('[data-panel="chapters"]') as HTMLElement;
    expect(panel.className).not.toMatch(/\bfixed\b|max-\[1179px\]:fixed/);
    expect(panel.className).toContain('max-[1179px]:absolute');
    expect((document.querySelector('[data-scrim]') as HTMLElement).className).not.toContain('fixed');
  });

  it('close on a press anywhere outside, the navigation rail included', () => {
    const onClose = mount('ch');
    fireEvent.pointerDown(screen.getByRole('link', { name: 'Production' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stay open for a press inside the panel, on a menu drawn from it, and on the button that toggles them', () => {
    const onClose = mount('ch');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Chapter one' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Menu from the drawer' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Chapters' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('listen for outside presses only while a drawer is open', () => {
    const onClose = mount(null);
    fireEvent.pointerDown(screen.getByRole('link', { name: 'Production' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
