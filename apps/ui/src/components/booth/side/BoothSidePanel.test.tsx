// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { BoothSidePanel, BoothSideToggle, useBoothSideOpen } from './BoothSidePanel';
import { sideData } from './fixture';
import { garden, queen } from './fixture';
import type { BoothReference } from './sections';
import { useBoothReference } from './useBoothReference';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function matchMedia(medium: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 1280px)' ? medium : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
}

function Harness({ reference = null, onOpenEntry = () => undefined }: { reference?: BoothReference | null; onOpenEntry?: (id: string) => void }) {
  const side = useBoothSideOpen();
  const [exited, setExited] = useState(0);
  return (
    <ApiProvider api={createMockApi()}>
      <div onKeyDown={undefined}>
        <BoothSideToggle open={side.open} onToggle={side.toggle} />
        <button type="button" data-testid="text-word" onClick={() => undefined}>
          word
        </button>
        <span data-testid="exits">{exited}</span>
        <BoothSidePanel data={sideData({ reference, onOpenEntry })} open={side.open} drawer={side.drawer} onOpenChange={side.setOpen} />
        <EscExit onExit={() => setExited((n) => n + 1)} />
      </div>
    </ApiProvider>
  );
}

// The page's own Esc handler, which exits the Booth unless the panel took the key.
function EscExit({ onExit }: { onExit: () => void }) {
  document.onkeydown = (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) onExit();
  };
  return null;
}

const panel = () => screen.getByLabelText('Side panel', { selector: 'aside' });

describe('voices nearby and the numbers', () => {
  it('lists the voices nearby with their Story Bible voice note, coming-up words and the session numbers', () => {
    matchMedia(false);
    render(<Harness />);
    const side = within(panel());
    expect(side.getByText('Voices in this scene')).toBeTruthy();
    expect(side.getByText('Clipped and loud. Never asks twice.')).toBeTruthy();
    expect(side.getByText('No voice note yet')).toBeTruthy();
    expect(side.getByText('Coming up')).toBeTruthy();
    expect(side.getByText('Garden')).toBeTruthy();
    expect(side.getByText('No punches yet')).toBeTruthy();
    expect(side.getByText(/0 punches/)).toBeTruthy();
    expect(side.getByText('01:15')).toBeTruthy();
  });
});

describe('the reference', () => {
  it('shows a clicked Story Bible name read-only, a Character with how they talk and how each name is said', () => {
    matchMedia(false);
    render(<Harness reference={{ entry: queen }} />);
    const ref = within(document.getElementById('booth-reference')!);
    expect(ref.getAllByText('Queen').length).toBeGreaterThan(0);
    expect(ref.getByText('Character')).toBeTruthy();
    expect(ref.getByText('Rules the court with a short temper.')).toBeTruthy();
    expect(ref.getByText('How they talk')).toBeTruthy();
    expect(ref.getByText('Her Majesty')).toBeTruthy();
    expect(ref.getByText('hɜː ˈmædʒəsti')).toBeTruthy();
    expect(document.getElementById('booth-reference')!.querySelector('input,textarea')).toBeNull();
    expect(within(panel()).getByText('This session')).toBeTruthy();
  });

  it('does not show how they talk for a place', () => {
    matchMedia(false);
    render(<Harness reference={{ entry: garden }} />);
    expect(screen.queryByText('How they talk')).toBeNull();
  });

  it('shows the note on a marked word with its thread', () => {
    matchMedia(false);
    render(<Harness reference={{ note: { name: 'Stress', quote: 'Garden', messages: [{ text: 'lean on it' }, { who: 'Author', text: 'yes' }] } }} />);
    const ref = within(document.getElementById('booth-reference')!);
    expect(ref.getByText('Stress')).toBeTruthy();
    expect(ref.getByText(/Garden/)).toBeTruthy();
    expect(ref.getByText('lean on it')).toBeTruthy();
    expect(ref.getByText('yes')).toBeTruthy();
  });

  it('has no reference section until something is clicked', () => {
    matchMedia(false);
    render(<Harness />);
    expect(document.getElementById('booth-reference')).toBeNull();
  });

  it('opens the entry in the Story Bible, and nothing else', async () => {
    matchMedia(false);
    const onOpenEntry = vi.fn();
    render(<Harness reference={{ entry: queen }} onOpenEntry={onOpenEntry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open in Story Bible' }));
    expect(onOpenEntry).toHaveBeenCalledWith('e-queen');
  });

  it('is set by a click on a name or a marked word and cleared by a plain word, and a new chapter starts empty', () => {
    let hook!: ReturnType<typeof useBoothReference>;
    function Probe({ chapterId }: { chapterId: string }) {
      hook = useBoothReference(chapterId);
      return null;
    }
    const { rerender } = render(<Probe chapterId="c1" />);
    act(() => hook.show({ entryId: 'e-queen' }));
    expect(hook.target).toEqual({ entryId: 'e-queen' });
    act(() => hook.clear());
    expect(hook.target).toBeNull();
    act(() => hook.show({ noteId: 's1' }));
    rerender(<Probe chapterId="c2" />);
    expect(hook.target).toBeNull();
  });
});

describe('the panel scrolls by keyboard', () => {
  it('is a tab stop, so a panel taller than the window can be scrolled without a mouse (axe scrollable-region-focusable)', () => {
    matchMedia(true);
    render(<Harness />);
    expect(panel().tabIndex).toBe(0);
  });
});

describe('the panel can be hidden', () => {
  it('above 1280 it starts open inline and the toggle hides it', async () => {
    matchMedia(false);
    render(<Harness />);
    expect(panel().hidden).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /side panel/i }));
    expect(panel().hidden).toBe(true);
  });

  it('above 1280 clicking the text does not close the inline panel', async () => {
    matchMedia(false);
    render(<Harness />);
    await userEvent.click(screen.getByTestId('text-word'));
    expect(panel().hidden).toBe(false);
  });

  it('at 1280 and below it starts closed as a drawer, the toggle opens it, Esc closes it before exiting', async () => {
    matchMedia(true);
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: /side panel/i });
    expect(panel().hidden).toBe(true);
    await userEvent.click(toggle);
    expect(panel().hidden).toBe(false);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    await userEvent.keyboard('{Escape}');
    expect(panel().hidden).toBe(true);
    expect(screen.getByTestId('exits').textContent).toBe('0');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('exits').textContent).toBe('1');
  });

  it('closes on a click outside, not on a click inside or on the toggle, and returns no focus trap', async () => {
    matchMedia(true);
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: /side panel/i });
    await userEvent.click(toggle);
    await userEvent.click(panel());
    expect(panel().hidden).toBe(false);
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    await userEvent.click(screen.getByTestId('text-word'));
    expect(panel().hidden).toBe(true);
  });

  it('opens when a reference is shown', () => {
    matchMedia(true);
    const { rerender } = render(<Harness />);
    expect(panel().hidden).toBe(true);
    rerender(<Harness reference={{ entry: queen }} />);
    expect(panel().hidden).toBe(false);
  });
});
