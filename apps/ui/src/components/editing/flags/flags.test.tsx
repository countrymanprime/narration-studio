// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { overlay } from '../../../overlay/overlayService';
import { createJournal, type Journal } from '../../../studio/journal/createJournal';
import { flagged, type ChapterDoc, type DocItem } from '../model';
import { marksDoc } from '../script/scriptFixtures';
import { FlagCard, type FlagCardProps } from './FlagCard';
import { Legend } from './Legend';
import { registerFlagAction } from './flagActions';
import { useAcceptWords } from './useAcceptWords';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SCORED = { conf: 0.5 } as const;
const doc = marksDoc();
const firstOf = (d: ChapterDoc, kind: 'extra' | 'miss' | 'mis' | 'low'): DocItem => flagged(d, kind)[0];

/** The same chapter with a second read of p-2's first words, which the duplicate finder (#1277) will mark. */
const dupDoc = (): ChapterDoc => {
  const d = marksDoc();
  const para = d.paras[1];
  para.items.slice(0, 2).forEach((i) => {
    i.dup = true;
  });
  return d;
};

function card(over: Partial<FlagCardProps> & { flag: string }, d: ChapterDoc = doc) {
  const key = over.flag.startsWith('dup:') ? over.flag.slice(4) : (d.items[d.index.get(over.flag) ?? 0]?.pid ?? '');
  const dp = d.paras.find((p) => p.p.id === key) ?? d.paras[0];
  const props: FlagCardProps = { doc: d, dp, score: SCORED, hear: vi.fn(), accept: vi.fn(), onClose: vi.fn(), ...over };
  render(<FlagCard {...props} />);
  return props;
}
const buttons = (): string[] => screen.getAllByRole('button').map((b) => b.textContent?.trim() ?? '');

describe('one card per kind, with the mock’s answers', () => {
  it.each([
    ['mis', 'Misread', ['Hear the word', 'It is right, accept', 'Mark for pickup']],
    ['miss', 'Not read', ['It is right, accept', 'Mark for pickup']],
    ['low', 'Low confidence', ['Hear the word', 'It is right, accept', 'Mark for pickup']],
    ['extra', 'Not in the script', ['Hear it', 'Keep this addition', 'Delete words and audio…']],
  ] as const)('%s', (kind, pill, labels) => {
    card({ flag: firstOf(doc, kind).key });
    const note = screen.getByRole('note');
    expect(within(note).getByText(pill)).toBeTruthy();
    expect(buttons()).toEqual(labels);
  });

  it('read twice', () => {
    card({ flag: 'dup:p-2' }, dupDoc());
    expect(within(screen.getByRole('note')).getByText('Read twice')).toBeTruthy();
    expect(buttons()).toEqual(['Stack as 2 takes', 'Leave in place', 'Delete second read…']);
  });
});

describe('looking changes nothing', () => {
  it('opens and closes without touching the host or the journal', async () => {
    const api = createMockApi();
    const spy = vi.spyOn(api, 'editingAccept');
    const { unmount } = render(
      <ApiProvider api={api}>
        <FlagCard doc={doc} dp={doc.paras[0]} flag={firstOf(doc, 'mis').key} score={SCORED} hear={null} accept={vi.fn()} onClose={vi.fn()} />
      </ApiProvider>,
    );
    unmount();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('a misread shows what was heard and how sure', () => {
  it('names both words and a percentage when the port gave a number', () => {
    const it = firstOf(doc, 'mis');
    card({ flag: it.key, score: { conf: 0.82 } });
    expect(screen.getByText(/Heard “sitter”, the script says “sister”/)).toBeTruthy();
    expect(screen.getByText(/82%/)).toBeTruthy();
  });

  it('says Not scored with the reason, never a figure, when conf is null', () => {
    card({ flag: firstOf(doc, 'mis').key, score: { conf: null, reason: 'no_word_scores' } });
    const note = screen.getByRole('note');
    expect(within(note).getByText(/Not scored/)).toBeTruthy();
    expect(note.textContent).not.toMatch(/\d+%/);
  });
});

describe('accepting records the words and Undo puts the flag back', () => {
  function Harness({ journal, chapterId, keys, api }: { journal: Journal; chapterId: string; keys: string[]; api: ReturnType<typeof createMockApi> }) {
    return (
      <ApiProvider api={api}>
        <Inner journal={journal} chapterId={chapterId} keys={keys} />
      </ApiProvider>
    );
  }
  function Inner({ journal, chapterId, keys }: { journal: Journal; chapterId: string; keys: string[] }) {
    const accept = useAcceptWords({ journal, chapterId });
    return <button onClick={() => void accept(keys)}>go</button>;
  }

  it('writes through the port as one journalled command and offers Undo', async () => {
    const api = createMockApi();
    const accept = vi.spyOn(api, 'editingAccept').mockResolvedValue({ chapterId: 'c1', words: [], changed: ['p-1:7'] });
    const unaccept = vi.spyOn(api, 'editingUnaccept').mockResolvedValue({ chapterId: 'c1', words: [], changed: ['p-1:7'] });
    const journal = createJournal({ dawName: () => 'REAPER', dawLastAction: async () => 'unknown' });
    const toastUndo = vi.spyOn(overlay, 'toastUndo');
    const changed = vi.fn();
    render(<Harness journal={journal} chapterId="c1" keys={['p-1:7']} api={api} />);
    fireEvent.click(screen.getByText('go'));
    await waitFor(() => expect(toastUndo).toHaveBeenCalledWith('Not flagged any more.', expect.any(Function)));
    expect(accept).toHaveBeenCalledWith('c1', ['p-1:7']);
    expect((await journal.entries()).length).toBe(1);
    const undo = toastUndo.mock.calls[0][1];
    await act(async () => {
      expect((await undo()).ok).toBe(true);
    });
    expect(unaccept).toHaveBeenCalledWith('c1', ['p-1:7']);
    expect(changed).not.toHaveBeenCalled();
  });

  it('the card’s accept buttons call accept with the word’s keys, then close', () => {
    const props = card({ flag: firstOf(doc, 'mis').key });
    fireEvent.click(screen.getByText('It is right, accept'));
    expect(props.accept).toHaveBeenCalledWith([firstOf(doc, 'mis').key]);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('Keep this addition accepts the whole run of extra words', () => {
    const props = card({ flag: firstOf(doc, 'extra').key });
    fireEvent.click(screen.getByText('Keep this addition'));
    expect(props.accept).toHaveBeenCalledWith(expect.arrayContaining([firstOf(doc, 'extra').key]));
  });
});

describe('hear plays the word with a short margin', () => {
  it('plays the span plus 0.3 s each side', () => {
    const it = firstOf(doc, 'mis');
    const props = card({ flag: it.key });
    fireEvent.click(screen.getByText('Hear the word'));
    expect(props.hear).toHaveBeenCalledWith(Math.max(0, (it.t0 ?? 0) - 0.3), (it.t1 ?? 0) + 0.3);
  });

  it('is disabled with the reason when there is no audio', () => {
    card({ flag: firstOf(doc, 'mis').key, hear: null });
    const b = screen.getByRole('button', { name: 'Hear the word' });
    expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(b.getAttribute('title')).toMatch(/audio/i);
  });
});

describe('actions another slice supplies', () => {
  it('Mark for pickup calls the one shared function with the word’s keys', () => {
    const shared = vi.fn();
    const off = registerFlagAction('markForPickup', shared);
    const props = card({ flag: firstOf(doc, 'miss').key });
    fireEvent.click(screen.getByText('Mark for pickup'));
    expect(shared).toHaveBeenCalledWith([firstOf(doc, 'miss').key]);
    expect(props.onClose).toHaveBeenCalled();
    off();
  });

  it('with none registered, the button is disabled with “Not available yet”', () => {
    card({ flag: firstOf(doc, 'extra').key });
    const b = screen.getByRole('button', { name: 'Delete words and audio…' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('title')).toBe('Not available yet');
  });

  it('Delete words and audio… hands the keys to the registered action and deletes nothing itself', () => {
    const del = vi.fn();
    const off = registerFlagAction('deleteWords', del);
    const props = card({ flag: firstOf(doc, 'extra').key });
    fireEvent.click(screen.getByText('Delete words and audio…'));
    expect(del).toHaveBeenCalledOnce();
    expect(props.accept).not.toHaveBeenCalled();
    off();
  });

  it('Leave in place closes a doubled read and changes nothing', () => {
    const stack = vi.fn();
    const off = registerFlagAction('stackAsTakes', stack);
    const props = card({ flag: 'dup:p-2' }, dupDoc());
    fireEvent.click(screen.getByText('Leave in place'));
    expect(props.onClose).toHaveBeenCalled();
    expect(stack).not.toHaveBeenCalled();
    off();
  });
});

describe('the legend', () => {
  it('names and counts each kind at 1440 and wider, and names the engine', () => {
    render(<Legend doc={doc} compact={false} />);
    const group = screen.getByRole('group');
    expect(group.getAttribute('aria-label')).toMatch(/Flagged by Whisper small/);
    expect(screen.getByText(/Not in the script · 1/)).toBeTruthy();
    expect(screen.getByText(/In the script, not read · 1/)).toBeTruthy();
    expect(screen.getByText(/Misread · 1/)).toBeTruthy();
    expect(screen.getByText(/Low confidence · 1/)).toBeTruthy();
  });

  it('uses short labels with no counts at 1280 and below', () => {
    render(<Legend doc={doc} compact />);
    const text = screen.getByRole('group').textContent ?? '';
    expect(text).toMatch(/Extra/);
    expect(text).toMatch(/Not read/);
    expect(text).toMatch(/Low/);
    expect(text).not.toMatch(/·\s*\d/);
  });

  it('shows Not transcribed yet when nothing is aligned', () => {
    const none = { ...doc, aligned: false } as ChapterDoc;
    render(<Legend doc={none} compact={false} />);
    expect(screen.getByText('Not transcribed yet')).toBeTruthy();
  });

  it('does not count accepted or cut words', () => {
    const d = marksDoc({ accepted: [firstOf(doc, 'mis').key] });
    render(<Legend doc={d} compact={false} />);
    expect(screen.getByText(/Misread · 0/)).toBeTruthy();
  });
});

describe('keyboard and announcement', () => {
  it('announces the card when it opens', () => {
    const announce = vi.spyOn(overlay, 'announce');
    card({ flag: firstOf(doc, 'miss').key });
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Not read'));
  });

  it('Escape closes the card and puts focus back on the word', () => {
    const it = firstOf(doc, 'mis');
    const word = document.createElement('span');
    word.tabIndex = -1;
    word.dataset.k = it.key;
    document.body.append(word);
    const props = card({ flag: it.key });
    fireEvent.keyDown(screen.getByRole('note'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(word);
    word.remove();
  });

  it('has no axe violations for each card', async () => {
    for (const k of ['mis', 'miss', 'low', 'extra'] as const) {
      cleanup();
      card({ flag: firstOf(doc, k).key });
      const r = await axe.run(screen.getByRole('note'));
      expect(r.violations).toEqual([]);
    }
  });
});
