// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, type DawSetupId } from '../../../fixtures/daw';
import { overlay } from '../../../overlay/overlayService';
import { createMockDawClient } from '../../../ports/daw';
import type { DawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { createJournal, type Journal } from '../../../studio/journal/createJournal';
import { buildWordMenu } from '../menu/wordMenuRegistry';
import { marksDoc } from '../script/scriptFixtures';
import { summarize } from '../model';
import { Diff } from './TakeDiff';
import { TakeChip } from './TakeChip';
import { TakeLines } from './TakeLines';
import { registerTakeControl } from './takeControls';
import { useKeepTakes } from './keepTake';
import { useLineTakes } from './useLineTakes';
import { useTakesGate } from './useTakesGate';
import { registerTakesMenuSection } from './takesMenuSection';
import { measuredPassage, partlyMeasuredPassage, singleTakePassage, unevenPassage } from './takeFixtures';
import { takeDiff } from './diff';
import type { LinePassage } from './types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let journal: Journal;
let daw: DawClient;
let useTake: ReturnType<typeof vi.fn>;
let toast: ReturnType<typeof vi.spyOn>;
let toastUndo: ReturnType<typeof vi.spyOn>;
let lineHook: ReturnType<typeof useLineTakes>;
let played: string[];

function makeDaw(setup: DawSetupId = 'reaper', refuse?: string): DawClient {
  const base = createMockDawClient(DAW_SETUPS[setup], { chapterIds: ['5'], candidateIds: ['t-7', 't-8', 't-9'], findingIds: [] });
  useTake = vi.fn(async (...args: Parameters<DawClient['useTake']>) =>
    refuse ? { ok: false, changed: false, message: refuse, undoSteps: 0, refused: refuse } : base.useTake(...args),
  );
  return { ...base, useTake: useTake as DawClient['useTake'] };
}

function Page({ passage }: { passage: LinePassage }) {
  const { kept, keep } = useKeepTakes(journal);
  const gate = useTakesGate();
  const [playing, setPlaying] = useState<string | null>(null);
  const playingRef = useRef<string | null>(null);
  const line = useLineTakes(passage, keep);
  lineHook = line;
  return (
    <main>
      <button
        type="button"
        data-end-play
        onClick={() => {
          playingRef.current = null;
          setPlaying(null);
        }}
      >
        end play
      </button>
      <TakeChip passage={passage} open={line.open} keptId={kept[passage.id] ?? null} controls={`takes-${passage.id}`} onToggle={line.toggle} />
      {line.open ? (
        <TakeLines
          passage={passage}
          onTake={line.onTake}
          keptId={kept[passage.id] ?? null}
          playingId={playing}
          gate={gate}
          onKeep={(t) => void keep(passage, t)}
          onPlay={(t) => {
            // Called again for the take that plays, it stops: only a start is a play.
            if (playingRef.current !== t.id) played.push(`${t.sourceFile}:${t.sourceStart}+${t.sourceLength}`);
            playingRef.current = playingRef.current === t.id ? null : t.id;
            setPlaying(playingRef.current);
          }}
        />
      ) : null}
    </main>
  );
}

const mount = (passage: LinePassage = measuredPassage(), setup: DawSetupId = 'reaper', refuse?: string) => {
  daw = makeDaw(setup, refuse);
  return render(
    <ApiProvider api={createMockApi()}>
      <PortOverrides clients={{ daw }}>
        <Page passage={passage} />
      </PortOverrides>
    </ApiProvider>,
  );
};
const chip = () => screen.getByRole('button', { name: /takes/ });
const flush = () => act(async () => {});

beforeEach(() => {
  journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'this' });
  toast = vi.spyOn(overlay, 'toast').mockImplementation(() => {});
  toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation(() => {});
  played = [];
});

describe('chip-under-a-line-with-more-than-one-take', () => {
  it('says how many takes, which is active and whether it is chosen, and opens the takes in place', () => {
    mount();
    expect(chip().textContent).toContain('3 takes');
    expect(chip().textContent).toContain('T-7');
    expect(chip().textContent).toContain('To choose');
    expect(chip().getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-takes]')).toBeNull();
    fireEvent.click(chip());
    expect(chip().getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelectorAll('[data-takes] [data-take]')).toHaveLength(3);
  });
  it('a line with one take has no chip', () => {
    mount(singleTakePassage());
    expect(document.querySelector('[data-tchip]')).toBeNull();
  });
});

describe('each-take-is-a-sub-line-with-its-evidence', () => {
  it('draws the level, the matched share, the figures and the Diff against the script', () => {
    mount();
    fireEvent.click(chip());
    const row = document.querySelector<HTMLElement>('[data-take="t-8"]')!;
    expect(row.querySelector('svg.mini')).not.toBeNull();
    expect(row.textContent).toContain('90%');
    expect(row.querySelector('[data-evidence]')!.textContent).toMatch(
      /Matched 90%.*Pause 1\.2 s.*Level −20\.4 dB.*Noise −61\.0 dB.*Clarity: Not measured.*Breaths 2/,
    );
    expect(row.querySelector('del')!.textContent).toBe('won’t');
    expect(row.querySelector('ins')!.textContent).toBe('don’t');
  });
  it('a figure that is a reason reads as the reason, and a take with none says why', () => {
    mount(partlyMeasuredPassage());
    fireEvent.click(chip());
    expect(document.querySelector('[data-take="t-8"] [data-evidence]')!.textContent).toContain('Pause: The file is not on this machine.');
    expect(document.querySelector('[data-take="t-9"] [data-evidence]')!.textContent).toContain('Matched: This take was not aligned');
    expect(document.querySelector('[data-take="t-9"]')!.textContent).toContain('This take cannot be heard.');
  });
  it('marks left-out words struck and added words underlined, not by colour alone, and shortens a long run', () => {
    const { container } = render(<Diff parts={takeDiff('a b c d e f g h tail', 'a tail x')} />);
    expect(container.querySelector('del')!.className).toContain('line-through');
    expect(container.querySelector('ins')!.className).toContain('underline');
    expect(container.querySelector('del')!.textContent).toBe('b c … (7 words)');
    expect(container.textContent).toContain('left out: ');
    expect(container.textContent).toContain('added: ');
  });
});

describe('suggestion-is-a-chip-with-evidence-never-applied', () => {
  it('shows Suggested on one take with a confidence, calls no useTake and preselects nothing', async () => {
    mount();
    await flush();
    fireEvent.click(chip());
    expect(document.querySelector('[data-suggested]')!.textContent).toMatch(/Suggested: T-7/);
    expect(document.querySelector('[data-take="t-7"]')!.textContent).toContain('Suggested');
    expect(document.querySelector('[data-suggested]')!.textContent).toMatch(/(High|Medium|Low) · \d\.\d\d/);
    expect(useTake).not.toHaveBeenCalled();
    expect(document.querySelector('[data-on-key]')).toBeNull();
    expect(chip().textContent).toContain('To choose');
  });
  it('says "Not comparable yet" with the reason and the steps that would make it surer', () => {
    mount(unevenPassage());
    fireEvent.click(chip());
    const s = document.querySelector('[data-suggested]')!;
    expect(s.textContent).toContain('Not comparable yet');
    expect(s.querySelector('[data-why]')!.textContent).toMatch(/dB apart/);
    expect([...s.querySelectorAll('[data-step]')].map((e) => e.getAttribute('data-step'))).toContain('normalise');
    expect(s.querySelector('button')).toBeNull();
  });
});

describe('keep-calls-the-daw-and-offers-undo', () => {
  it('the Keep button calls useTake once, offers the usual Undo and only then shows Kept', async () => {
    mount();
    await flush();
    fireEvent.click(chip());
    fireEvent.click(screen.getByRole('button', { name: 'Keep T-8' }));
    expect(chip().textContent).toContain('To choose');
    await flush();
    expect(useTake).toHaveBeenCalledTimes(1);
    expect(useTake).toHaveBeenCalledWith('5', 10, 20, 't-8');
    expect(toastUndo).toHaveBeenCalledTimes(1);
    expect(chip().textContent).toContain('Kept');
    expect(document.querySelector('[data-take="t-8"]')!.textContent).toContain('Kept');
  });
  it('Undo puts the active take back; once a later change came after it says so', async () => {
    mount();
    await flush();
    fireEvent.click(chip());
    fireEvent.click(screen.getByRole('button', { name: 'Keep T-8' }));
    await flush();
    const undo = toastUndo.mock.calls[0][1] as () => Promise<{ ok: boolean }>;
    await act(async () => {
      expect((await undo()).ok).toBe(true);
    });
    expect(useTake).toHaveBeenLastCalledWith('5', 10, 20, 't-7');
    expect(chip().textContent).toContain('To choose');
    fireEvent.click(screen.getByRole('button', { name: 'Keep T-8' }));
    await flush();
    const first = toastUndo.mock.calls[1][1] as () => Promise<{ ok: boolean; refusal?: { reason: string } }>;
    await act(async () => {
      await journal.act({
        label: 'Later change',
        touches: ['other'],
        daw: true,
        run: async () => ({ ok: true, value: 1 }),
        undo: async () => ({ ok: true, value: 1 }),
      });
    });
    await act(async () => {
      const r = await first();
      expect(r.ok).toBe(false);
      expect(r.refusal!.reason).toContain("Undo 'Later change' first");
    });
  });
  it('a refusal shows the DAW’s own sentence and changes nothing', async () => {
    mount(measuredPassage(), 'reaper', 'The take is no longer in the project.');
    await flush();
    fireEvent.click(chip());
    fireEvent.click(screen.getByRole('button', { name: 'Keep T-8' }));
    await flush();
    expect(toast).toHaveBeenCalledWith('The take is no longer in the project.', { tone: 'error' });
    expect(toastUndo).not.toHaveBeenCalled();
    expect(chip().textContent).toContain('To choose');
    expect(await journal.entries()).toHaveLength(0);
  });
  it('is off with the setup’s sentence where the DAW cannot choose a take', async () => {
    mount(measuredPassage(), 'reaper-off');
    await flush();
    fireEvent.click(chip());
    const keep = screen.getByRole('button', { name: 'Keep T-8' });
    expect(keep.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(keep);
    await flush();
    expect(useTake).not.toHaveBeenCalled();
  });
});

describe('t-keys-walk-the-takes', () => {
  it('T opens the takes and puts the keys on the active take; T and Shift+T walk round; aria-activedescendant follows', async () => {
    mount();
    await flush();
    act(() => lineHook.handlers.takes(1));
    expect(chip().getAttribute('aria-expanded')).toBe('true');
    const group = () => document.querySelector('[data-takes]')!;
    expect(group().getAttribute('aria-activedescendant')).toBe('take-ps-9-t-7');
    act(() => lineHook.handlers.takes(1));
    expect(group().getAttribute('aria-activedescendant')).toBe('take-ps-9-t-8');
    act(() => lineHook.handlers.takes(-1));
    act(() => lineHook.handlers.takes(-1));
    expect(group().getAttribute('aria-activedescendant')).toBe('take-ps-9-t-9');
    expect(document.getElementById('take-ps-9-t-9')!.getAttribute('data-on-key')).toBe('true');
  });
  it('Enter keeps the take the keys are on, and again says it is kept already', async () => {
    mount();
    await flush();
    act(() => lineHook.handlers.takes(1));
    act(() => lineHook.handlers.takes(1));
    act(() => lineHook.handlers.keep());
    await flush();
    expect(useTake).toHaveBeenCalledTimes(1);
    expect(useTake).toHaveBeenCalledWith('5', 10, 20, 't-8');
    act(() => lineHook.handlers.keep());
    await flush();
    expect(useTake).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith('T-8 is already kept.');
  });
  it('a line with one take says so on T', () => {
    mount(singleTakePassage());
    act(() => lineHook.handlers.takes(1));
    expect(toast).toHaveBeenCalledWith('This line has one take.');
  });
});

describe('play-a-take-and-look-again', () => {
  it('plays the take’s own source range and has no delete control', async () => {
    mount();
    fireEvent.click(chip());
    fireEvent.click(screen.getByRole('button', { name: 'Play T-9' }));
    expect(played).toEqual(['t-9.wav:12+8']);
    expect(screen.getByRole('button', { name: 'Stop T-9' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /delete|remove/i })).toBeNull();
    fireEvent.click(chip());
    fireEvent.click(chip());
    expect(document.querySelectorAll('[data-take]')).toHaveLength(3);
  });
});

describe('placed-says-how-it-was-placed', () => {
  it('“Placed exactly” for map and “Aligned to the text” for aligned', () => {
    mount();
    fireEvent.click(chip());
    expect(document.querySelector('[data-take="t-7"]')!.textContent).toContain('Placed exactly');
    expect(document.querySelector('[data-take="t-8"]')!.textContent).toContain('Aligned to the text');
  });
});

describe('menu-section-offers-the-takes', () => {
  const selection = () => {
    const doc = marksDoc();
    const keys = [doc.items[0].key];
    return { doc, keys, summary: summarize(doc, keys, [], (s) => s), play: () => {}, notify: () => {} };
  };
  it('offers Show takes of this line and one Keep per take with the active one marked, and runs them', () => {
    const passage = measuredPassage();
    const keep = vi.fn();
    const show = vi.fn();
    const remove = registerTakesMenuSection({ passageOf: () => passage, show, keep, gate: () => ({ ok: true }) });
    const items = buildWordMenu(selection()).groups.flat();
    remove();
    expect(items.map((i) => i.label)).toEqual(['Show takes of this line (T)', 'Keep T-7 (active)', 'Keep T-8', 'Keep T-9']);
    items[0].onSelect();
    items[2].onSelect();
    expect(show).toHaveBeenCalledWith(passage);
    expect(keep).toHaveBeenCalledWith(passage, passage.takes[1]);
  });
  it('is off with the DAW’s reason when it cannot, and absent on a line with one take', () => {
    const remove = registerTakesMenuSection({
      passageOf: () => measuredPassage(),
      show: () => {},
      keep: () => {},
      gate: () => ({ ok: false, reason: 'REAPER is not running.' }),
    });
    const items = buildWordMenu(selection()).groups.flat();
    remove();
    expect(items.filter((i) => i.key.startsWith('keep-take')).every((i) => i.unavailable === 'REAPER is not running.')).toBe(true);
    const removeOne = registerTakesMenuSection({ passageOf: () => singleTakePassage(), show: () => {}, keep: () => {}, gate: () => ({ ok: true }) });
    expect(
      buildWordMenu(selection())
        .groups.flat()
        .some((i) => i.key.startsWith('keep-take')),
    ).toBe(false);
    removeOne();
  });
});

describe('slots-for-hide-prep-and-split', () => {
  it('shows none with nothing registered, and a registered control in the footer in order', () => {
    mount();
    fireEvent.click(chip());
    expect(document.querySelector('[data-takes-footer]')).toBeNull();
    let removers: Array<() => void> = [];
    act(() => {
      removers = [
        registerTakeControl({ id: 'b', order: 20, render: () => <button type="button">Second</button> }),
        registerTakeControl({ id: 'a', order: 10, render: () => <button type="button">First</button> }),
        registerTakeControl({ id: 'none', order: 15, render: () => null }),
      ];
    });
    const footer = document.querySelector('[data-takes-footer]')!;
    expect([...footer.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['First', 'Second']);
    removers.forEach((r) => r());
  });
});

describe('opening the page', () => {
  it('calls no useTake, even with the suggestion showing', async () => {
    mount(unevenPassage());
    await flush();
    fireEvent.click(chip());
    await waitFor(() => expect(within(document.body).getAllByRole('button').length).toBeGreaterThan(0));
    expect(useTake).not.toHaveBeenCalled();
  });
});

describe('axe', () => {
  it('has no violations with the takes open', async () => {
    mount(partlyMeasuredPassage());
    await flush();
    fireEvent.click(chip());
    const result = await axe.run(document.body, { rules: { region: { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('compare-the-takes-of-a-line', () => {
  /** The page marks a take as playing until it is told to end; `endPlay` is the take reaching its end. */
  const endPlay = () => fireEvent.click(document.querySelector('[data-end-play]')!);
  const openTakes = (passage: LinePassage = measuredPassage()) => {
    mount(passage);
    fireEvent.click(chip());
  };

  it('plays every take in order, and the two takes the narrator picks A then B', async () => {
    openTakes();
    const a = screen.getByRole('combobox', { name: 'First take to compare' }) as HTMLSelectElement;
    const b = screen.getByRole('combobox', { name: 'Second take to compare' }) as HTMLSelectElement;
    // The pickers start on the active take and the suggested one; neither is a keep.
    expect(a.value).toBe('t-7');
    expect(b.value).toBe('t-8');
    expect(document.querySelector('[data-take="t-7"]')!.textContent).not.toContain('Kept');

    fireEvent.click(screen.getByRole('button', { name: 'Play every take' }));
    expect(played).toEqual(['t-7.wav:12+8']);
    endPlay();
    await flush();
    endPlay();
    await flush();
    endPlay();
    await flush();
    expect(played).toEqual(['t-7.wav:12+8', 't-8.wav:12+8', 't-9.wav:12+8']);

    played.length = 0;
    fireEvent.change(a, { target: { value: 't-9' } });
    fireEvent.change(b, { target: { value: 't-8' } });
    fireEvent.click(screen.getByRole('button', { name: 'A then B' }));
    expect(played).toEqual(['t-9.wav:12+8']);
    endPlay();
    await flush();
    expect(played).toEqual(['t-9.wav:12+8', 't-8.wav:12+8']);
    endPlay();
    await flush();
    expect(played).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Stop comparing' })).toBeNull();
  });

  it('the pickers default to the kept take and the suggested one, and the same take twice is refused with a reason', async () => {
    mount();
    await flush();
    fireEvent.click(chip());
    fireEvent.click(screen.getByRole('button', { name: 'Keep T-9' }));
    await flush();
    const a = screen.getByRole('combobox', { name: 'First take to compare' }) as HTMLSelectElement;
    expect(a.value).toBe('t-9');
    fireEvent.change(screen.getByRole('combobox', { name: 'Second take to compare' }), { target: { value: 't-9' } });
    expect(screen.getByRole('button', { name: 'A then B' }).getAttribute('aria-disabled')).toBe('true');
    expect(document.querySelector('[data-compare-note]')!.textContent).toContain('Pick two different takes');
  });

  it('shows the level note when the two takes were recorded at different levels', () => {
    openTakes(unevenPassage());
    expect(document.querySelector('[data-compare-level]')!.textContent).toMatch(/3\.0 dB apart/);
  });

  it('Stop and Escape stop the comparison, and a DAW that cannot play a take says why', async () => {
    openTakes();
    fireEvent.click(screen.getByRole('button', { name: 'Play every take' }));
    expect(played).toEqual(['t-7.wav:12+8']);
    fireEvent.click(screen.getByRole('button', { name: 'Stop comparing' }));
    await flush();
    endPlay();
    await flush();
    expect(played).toEqual(['t-7.wav:12+8']);

    fireEvent.click(screen.getByRole('button', { name: 'A then B' }));
    expect(played).toHaveLength(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(screen.queryByRole('button', { name: 'Stop comparing' })).toBeNull();
    endPlay();
    await flush();
    expect(played).toHaveLength(2);
  });

  it('a take that cannot be heard is skipped by Play every take and refuses A then B with its reason', () => {
    openTakes(partlyMeasuredPassage());
    fireEvent.click(screen.getByRole('button', { name: 'Play every take' }));
    endPlay();
    expect(played).toEqual(['t-7.wav:12+8', 't-8.wav:12+8']);
    endPlay();
    expect(played).toHaveLength(2);
    expect(document.querySelector('[data-compare-note]')!.textContent).toContain('T-9: This take cannot be heard.');
    fireEvent.change(screen.getByRole('combobox', { name: 'Second take to compare' }), { target: { value: 't-9' } });
    expect(screen.getByRole('button', { name: 'A then B' }).getAttribute('aria-disabled')).toBe('true');
    expect(document.querySelector('[data-compare-note]')!.textContent).toContain('This take cannot be heard.');
  });
});
