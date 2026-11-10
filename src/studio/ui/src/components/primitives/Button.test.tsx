// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { ECHO_WINDOW_MS } from './echoGuard';

afterEach(cleanup);

describe('Button pending', () => {
  it('calls onClick when it is not pending', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('says it is busy, shows a spinner, and ignores a press while pending', () => {
    const onClick = vi.fn();
    render(
      <Button pending onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.querySelector('svg')).not.toBeNull();
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('stays focusable while pending, so a keyboard user keeps their place, and is not a disabled button', () => {
    render(<Button pending>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    button.focus();
    expect(document.activeElement).toBe(button);
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not submit a form while pending, and does once it is not', () => {
    const submit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    const { rerender } = render(
      <form onSubmit={submit}>
        <Button type="submit" pending>
          Save
        </Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submit).not.toHaveBeenCalled();
    rerender(
      <form onSubmit={submit}>
        <Button type="submit">Save</Button>
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it('carries no busy state and no spinner when it is not pending', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(button.hasAttribute('aria-disabled')).toBe(false);
    expect(button.querySelector('svg')).toBeNull();
  });

  it('spins only for people who have not asked for reduced motion', () => {
    render(<Button pending>Save</Button>);
    const classes = (screen.getByRole('button').querySelector('svg') as SVGElement).getAttribute('class')?.split(/\s+/) ?? [];
    expect(classes).toContain('motion-ok:animate-spin');
    expect(classes).not.toContain('animate-spin');
  });
});

// The measured spec. jsdom computes no Tailwind, so these read the classes that name the tokens; the atlas measures the pixels.
describe('Button look', () => {
  const classes = (element: HTMLElement) => element.getAttribute('class')?.split(/\s+/) ?? [];

  it('is 32 px by default and 28 px at size sm, from the height tokens', () => {
    render(
      <>
        <Button>Save</Button>
        <Button size="sm">Resolve</Button>
      </>,
    );
    expect(classes(screen.getByRole('button', { name: 'Save' }))).toContain('min-h-[var(--button-height)]');
    expect(classes(screen.getByRole('button', { name: 'Resolve' }))).toContain('min-h-[var(--button-height-sm)]');
  });

  // The behaviour changed: disabled was a 55% copy of the variant; it is now one grey look (R3EN2-14, R3MS-5).
  it('sets its own label type, tracking, radius and the grey disabled look', () => {
    render(<Button>Save</Button>);
    const list = classes(screen.getByRole('button'));
    for (const token of [
      'px-3',
      'leading-none',
      'text-[length:var(--font-size-sm)]',
      'tracking-[var(--tracking-button)]',
      'rounded-[var(--radius-button)]',
      'uppercase',
      'disabled:bg-[var(--surface-2)]',
      'disabled:text-[var(--text-muted)]',
    ]) {
      expect(list).toContain(token);
    }
  });

  it('fills secondary with --surface and leaves ghost unfilled', () => {
    render(
      <>
        <Button variant="secondary">Export</Button>
        <Button variant="ghost">Cancel</Button>
      </>,
    );
    expect(classes(screen.getByRole('button', { name: 'Export' }))).toContain('bg-[var(--surface)]');
    expect(classes(screen.getByRole('button', { name: 'Cancel' }))).toContain('bg-transparent');
  });

  it('draws a link as underlined text with none of the button chrome, whatever its size', () => {
    render(
      <Button variant="link" size="sm">
        Settings
      </Button>,
    );
    const list = classes(screen.getByRole('button', { name: 'Settings' }));
    expect(list).toContain('underline');
    for (const chrome of ['border', 'uppercase', 'px-3', 'min-h-[var(--button-height-sm)]']) expect(list).not.toContain(chrome);
  });
});

describe('IconButton size', () => {
  it('is 32 px by default and 28 px at size sm', () => {
    render(
      <>
        <IconButton label="Play">
          <span />
        </IconButton>
        <IconButton label="Stop" size="sm">
          <span />
        </IconButton>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('class')).toContain('size-[var(--button-height)]');
    expect(screen.getByRole('button', { name: 'Stop' }).getAttribute('class')).toContain('size-[var(--button-height-sm)]');
  });
});

describe('IconButton pending', () => {
  it('swaps its icon for a spinner, keeps its name, and ignores a press while pending', () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Save changes" pending onClick={onClick}>
        <span data-testid="icon" />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Save changes' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('icon')).toBeNull();
    expect(button.querySelector('svg')).not.toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows its icon and calls onClick when it is not pending', () => {
    const onClick = vi.fn();
    render(
      <IconButton label="Save changes" onClick={onClick}>
        <span data-testid="icon" />
      </IconButton>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByTestId('icon')).toBeTruthy();
    expect(onClick).toHaveBeenCalledOnce();
  });
});

// #3053: a double click on Stamp selected the word "STAMP". A button's label is a control, not text to copy; a link-styled button reads as text and stays selectable.
describe('Button label selection', () => {
  it.each(['primary', 'secondary', 'ghost', 'danger', 'danger-solid', 'inverse'] as const)(
    'a %s button does not select its label on a double click',
    (variant) => {
      render(<Button variant={variant}>Stamp</Button>);
      expect(screen.getByRole('button', { name: 'Stamp' }).className).toMatch(/\bselect-none\b/);
    },
  );

  it('a link-styled button stays selectable like the text around it', () => {
    render(<Button variant="link">Stamp</Button>);
    expect(screen.getByRole('button', { name: 'Stamp' }).className).not.toMatch(/\bselect-none\b/);
  });
});

function Swap({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [started, setStarted] = useState(false);
  return started ? (
    <IconButton key="cancel" label="Cancel" replacesPressed onClick={onCancel} />
  ) : (
    <>
      <button onClick={() => setStarted(true)}>Download</button>
      <Button replacesPressed onClick={onDone}>
        Done
      </Button>
    </>
  );
}

describe('replacesPressed, a button that was already there', () => {
  it("goes through when the click before it was on a different, vanished control (another row's Download)", () => {
    vi.useFakeTimers();
    try {
      const second = vi.fn();
      const Pair = () => {
        const [first, setFirst] = useState(true);
        return (
          <>
            {first && <button onClick={() => setFirst(false)}>First</button>}
            <Button replacesPressed onClick={second}>
              Second
            </Button>
          </>
        );
      };
      render(<Pair />);
      vi.advanceTimersByTime(ECHO_WINDOW_MS);
      fireEvent.click(screen.getByRole('button', { name: 'First' }));
      fireEvent.click(screen.getByRole('button', { name: 'Second' }));
      expect(second).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('replacesPressed', () => {
  it('ignores a press right after a click on a control that has since been replaced, and only that', () => {
    vi.useFakeTimers();
    try {
      const onDone = vi.fn();
      const onCancel = vi.fn();
      render(<Swap onDone={onDone} onCancel={onCancel} />);
      vi.advanceTimersByTime(ECHO_WINDOW_MS);
      // A press with no earlier click goes through, however soon the button appeared.
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(onDone).toHaveBeenCalledOnce();
      // The echo: Download is pressed and replaced by Cancel, and the second click lands on Cancel at once.
      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onCancel).not.toHaveBeenCalled();
      // A triple click, or a held key repeating, is ignored the whole window, not only once.
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onCancel).not.toHaveBeenCalled();
      vi.advanceTimersByTime(ECHO_WINDOW_MS);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onCancel).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Button disabledReason', () => {
  it('ignores a press, stays focusable and says why on focus (#3276)', async () => {
    const onClick = vi.fn();
    render(
      <Button disabledReason="Choose a region first." onClick={onClick}>
        Approve
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Approve' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    button.focus();
    expect(await screen.findByRole('tooltip')).toHaveProperty('textContent', 'Choose a region first.');
  });
});
