// @vitest-environment jsdom
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { Finding } from '../../../api/contracts/findings';
import type { PassageTake, WorkspaceAlignmentResult, WorkspaceTakesResult } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import { inspectorFinding } from '../inspector/testFinding';
import { spotOf } from './spot';
import { SpotTakes } from './SpotTakes';
import { TakeLanes } from './TakeLanes';
import { TakesBadge } from './TakesBadge';
import { useSpotTakes } from './useSpotTakes';

afterEach(cleanup);

const take = (id: string, over: Partial<PassageTake> = {}): PassageTake => ({
  id,
  source: 'item_take',
  action: 'make_active',
  confirm: false,
  label: id,
  detail: '',
  active: false,
  itemGuid: 'g',
  takeGuid: id,
  sourceFile: `${id}.wav`,
  sourceStart: 2,
  sourceLength: 3.5,
  usable: true,
  compared: false,
  ...over,
});
const takesResult = (candidates: PassageTake[], passageId = 'p1'): WorkspaceTakesResult => ({
  chapterId: 'c1',
  firstToken: 0,
  lastToken: 3,
  firstParagraph: 0,
  lastParagraph: 0,
  words: 4,
  passageId,
  itemGuid: 'g',
  candidates,
});
const spot = (candidates: PassageTake[]) => spotOf(takesResult(candidates), { script: 'I could not help it', at: 10, heard: 'I could not help myself' })!;
const three = () => spot([take('a'), take('b', { sourceStart: 9 }), take('c', { active: true })]);

describe('badge-follows-the-text-and-says-takes', () => {
  it('says "N takes" with an accessible name, and nothing under two', () => {
    const { rerender } = render(<TakesBadge count={3} />);
    expect(screen.getByLabelText('3 takes at this spot').textContent).toBe('3 takes');
    rerender(<TakesBadge count={1} />);
    expect(screen.queryByLabelText(/takes at this spot/)).toBeNull();
  });
});

describe('lanes-draw-the-other-takes-and-the-active-as-a-band', () => {
  it('draws the active take as a labelled band and the others as lanes, in the window scale, dimming a hidden one', () => {
    const s = spot([take('a'), take('b', { usable: false, reason: 'gone' }), take('c', { active: true, sourceLength: 5 })]);
    const { container } = render(<TakeLanes spot={s} winStart={0} winLen={20} />);
    const band = container.querySelector<HTMLElement>('[data-active-band=c]')!;
    expect(band.textContent).toBe('Take 3 · Kept');
    expect(band.style.left).toBe('50%');
    expect(band.style.width).toBe('25%');
    expect(container.querySelectorAll('[data-lane]')).toHaveLength(2);
    expect(container.querySelector('[data-lane=b] div')!.className).toContain('opacity-40');
    expect(container.querySelector('[data-lane=a] div')!.className).not.toContain('opacity-40');
  });
  it('draws nothing at a one-take spot', () => {
    const { container } = render(<TakeLanes spot={null} winStart={0} winLen={20} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('inspector-section-lists-takes-with-raw-play', () => {
  let play: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    play = vi.fn(async () => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as never);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });
  const view = (s = three(), props: { onOpenInEditing?: () => void; refusal?: string } = {}) =>
    render(
      <ApiProvider api={createMockApi()}>
        <SpotTakes spot={s} onOpenInEditing={props.onOpenInEditing ?? vi.fn()} refusal={props.refusal} />
      </ApiProvider>,
    );

  it('lists the takes with length and a Kept pill, the kept take heard against the script', () => {
    view();
    expect(screen.getByRole('heading', { name: 'Takes at this spot · 3' })).toBeTruthy();
    expect(screen.getAllByText('3.5 s')).toHaveLength(3);
    expect(screen.getByText('✓ Kept')).toBeTruthy();
    expect(document.querySelector('[data-heard=c] del')!.textContent).toBe('it');
    expect(document.querySelector('[data-heard=c] ins')!.textContent).toBe('myself');
    expect(document.querySelector('[data-heard=a]')).toBeNull();
  });

  it('plays a take raw, and a second press stops it; another take replaces it', async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole('button', { name: 'Play Take 2' }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Stop Take 2' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Play Take 1' }));
    expect(screen.queryByRole('button', { name: 'Stop Take 2' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop Take 1' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Stop Take 1' }));
    expect(screen.getByRole('button', { name: 'Play Take 1' })).toBeTruthy();
  });

  it('disables a take with no usable source and says the host reason', async () => {
    view(spot([take('a'), take('b', { usable: false, reason: 'The item is not live.' })]));
    expect(screen.getByRole('button', { name: 'Play Take 2' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('The item is not live.')).toBeTruthy();
  });

  it('read-mostly: one Manage takes in Editing button and no keep, delete, hide or rank', async () => {
    const onOpen = vi.fn();
    view(three(), { onOpenInEditing: onOpen });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Manage takes in Editing' }));
    expect(onOpen).toHaveBeenCalledWith('c1', 'p1');
    expect(screen.queryByRole('button', { name: /keep|delete|hide|rank|use/i })).toBeNull();
  });

  it('shows the host refusal when there is no spot', () => {
    view(null as never, { refusal: 'REAPER is not connected.' });
    expect(screen.getByText('REAPER is not connected.')).toBeTruthy();
  });
});

describe('counts-only-where-several (hook)', () => {
  const alignment = (): WorkspaceAlignmentResult => ({
    chapterId: 'c1',
    state: 'current',
    reasons: [],
    needsAlignAgain: false,
    paragraphs: [
      { id: 'p1', text: 'one two' },
      { id: 'p2', text: 'three' },
    ],
    tokens: [
      { i: 0, p: 'p1', w: 0, text: 'one', status: 'read', item: 0, start: 1 },
      { i: 1, p: 'p1', w: 1, text: 'two', status: 'read', item: 0, start: 2 },
      { i: 2, p: 'p2', w: 0, text: 'three', status: 'read' },
    ],
    extras: [],
    items: [{ index: 0, itemGuid: 'g', live: true, sourceStart: 0, position: 100, playRate: 1 }],
  });
  const note = (id: string, paragraph: string): Finding =>
    inspectorFinding({ id, manuscript: { chapter_id: 'c1', span: { paragraph_id: paragraph }, expected: 'a', recorded: 'b' } });

  it('asks the host once per distinct passage, counts only multi-take spots, and draws no badge before the answer', async () => {
    const workspaceTakes = vi.fn(async (_c: string, first: number) => takesResult(first === 0 ? [take('a'), take('b', { active: true })] : [take('a')]));
    const api = { ...createMockApi(), workspaceAlignment: vi.fn(async () => alignment()), workspaceTakes };
    const notes = [note('n1', 'p1'), note('n2', 'p1'), note('n3', 'p2')];
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const { result } = renderHook(() => useSpotTakes('c1', notes), { wrapper });
    expect(result.current.counts.size).toBe(0);
    await waitFor(() => expect(result.current.counts.get('n1')).toBe(2));
    expect(result.current.counts.get('n2')).toBe(2);
    expect(result.current.counts.has('n3')).toBe(false);
    expect(workspaceTakes).toHaveBeenCalledTimes(2);
    expect(result.current.spotFor('n1')?.takes[1].start).toBe(101);
    expect(result.current.spotFor('n1')?.takes[1].heard).toBe('one two');
  });

  it('keeps the host refusal sentence', async () => {
    const api = {
      ...createMockApi(),
      workspaceAlignment: vi.fn(async () => alignment()),
      workspaceTakes: vi.fn(async () => Promise.reject(new Error('Not for this DAW.'))),
    };
    const wrapper = ({ children }: { children: ReactNode }) => <ApiProvider api={api}>{children}</ApiProvider>;
    const notes = [note('n1', 'p1')];
    const { result } = renderHook(() => useSpotTakes('c1', notes), { wrapper });
    await waitFor(() => expect(result.current.refusalFor('n1')).toContain('Not for this DAW'));
  });
});

describe('read-mostly: no use-take', () => {
  it('no file here calls workspaceUseTake or imports the Takes panel', () => {
    const sources = import.meta.glob<string>('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
    const own = Object.entries(sources).filter(([name]) => !/\.(test|stories)\./.test(name));
    expect(own.length).toBeGreaterThan(3);
    for (const [name, source] of own) expect(source, name).not.toMatch(/workspaceUseTake|TakesPanel|takesPassage/);
  });
});
