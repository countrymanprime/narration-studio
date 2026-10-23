// @vitest-environment jsdom
// The state matrix (definition of done, rule 3) for marking a voice sample in Editing, written before the hook and the dialog. Each cell names its test.
//
//   empty (nothing selected)       'V with nothing selected says to select the words first and opens nothing'
//   one, many                      'the three-action path: V, then Enter, saves the first speaker's sample' (many characters: 'the character list...')
//   at the limit                   'a character at 19 of 20 says so and saves', 'a character at 20 says Delete one first and Save is off'
//   huge                           not tested here: the length limits are the host's (voicesample tests); 'a refusal from the host stays in the dialog'
//   loading                        'Save is busy while the host answers and a second press does nothing'
//   refused (page)                 'words in two takes are refused before asking', 'words that were not heard...', 'a stale check'
//   refused (host)                 'a refusal from the host stays in the dialog, and Save can be pressed again', 'every reason the host can give is shown as its own sentence'
//   failed                         'a rejected save is a sentence in the dialog', 'a failed read is a note and the dialog still opens'
//   stale                          'a stale check' (refused before asking)
//   long, right-to-left, emoji     'a label and note in any script are sent as typed, trimmed'
//   rapid double-fire              'Save is busy while the host answers and a second press does nothing'
//   Undo, a repeat                 'Undo removes the sample', 'marking the same stretch again says so and offers no Undo', 'a failed Undo is a toast'
//   the word menu, the toolbar     'the selection toolbar and the word menu both open the dialog'
//   keys                           'Enter in the note is a new line and Ctrl+Enter saves from it'
//   primary                        'Make primary is on for a character's first sample and the narrator's choice stays'
//   Play range                     'Play range plays the stretch of the take and again stops it', 'Play range stops a voice sample that is playing'
//   reload, leave mid-action,
//   the DAW never answers          not tested: the dialog holds no state the host keeps, and nothing here talks to the DAW (the host reads the saved project when Save is pressed)
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../api/ApiContext';
import type { GuideDialogueCue, GuideEntity } from '../../../api/contracts/storyBible';
import type { VoiceSample, VoiceSampleAnswer, VoiceSampleMarkRequest, VoiceSampleRefusalReason, VoiceSamples } from '../../../api/contracts/voiceSamples';
import { VOICE_SAMPLE_SENTENCES } from '../../../api/contracts/voiceSamples';
import type { WorkspaceAlignmentResult, WorkspaceToken } from '../../../api/contracts/workspace';
import { createMockApi } from '../../../api/mockApi';
import { COMMAND_CATALOG } from '../../../input/commands.catalog';
import { gesture } from '../../../input/gestures';
import type { GestureEvent, InputSource } from '../../../input/InputSource';
import { defaultKeymap } from '../../../input/keymap';
import { CommandRouter, CommandScope } from '../../../input/router';
import { OverlayHost } from '../../../overlay/OverlayHost';
import { overlay } from '../../../overlay/overlayService';
import { ContextMenuHost } from '../../layout/ContextMenuHost';
import { SelectionBar } from '../bar/SelectionBar';
import type { ScriptPlayback } from '../bar/useScriptPlayback';
import { useEditingKeys } from '../keys/useEditingKeys';
import { buildWordMenu } from '../menu/wordMenuRegistry';
import { summarize, type ChapterDoc } from '../model';
import { EditingPageProvider, useEditingPage } from '../script/EditingPageState';
import { marksDoc } from '../script/scriptFixtures';
import { playSample, samplePlayerState, stopSample } from '../../voicesamples/samplePlayerStore';
import { useVoiceSample } from './useVoiceSample';

const idle: ScriptPlayback = {
  playing: false,
  follow: true,
  setFollow: () => {},
  toggle: () => {},
  playFrom: () => {},
  playSelection: () => {},
  skip: () => {},
  stop: vi.fn(),
};

const heard = (p: string, w: number, text: string, start: number, end: number, item = 0): WorkspaceToken => ({
  i: 0,
  p,
  w,
  text,
  status: 'read',
  item,
  start,
  end,
});
function workspace(over: Partial<WorkspaceAlignmentResult> = {}): WorkspaceAlignmentResult {
  const p1 = ['Alice', 'was', 'very', 'tired', 'of', 'sitting', 'by', 'her', 'sister.'];
  const p2 = ['Once', 'or', 'twice', 'she', 'had', 'peeped'];
  const tokens = [
    ...p1.map((t, w) => (w === 2 ? ({ i: 0, p: 'p-1', w, text: t, status: 'skip' } as WorkspaceToken) : heard('p-1', w, t, 10 + w * 0.5, 10.5 + w * 0.5))),
    ...p2.map((t, w) => heard('p-2', w, t, 40 + w * 0.5, 40.5 + w * 0.5, 1)),
  ].map((t, i) => ({ ...t, i }));
  return {
    chapterId: 'chapter-1',
    state: 'current',
    reasons: [],
    needsAlignAgain: false,
    paragraphs: [
      { id: 'p-1', text: p1.join(' ') },
      { id: 'p-2', text: p2.join(' ') },
    ],
    tokens,
    extras: [],
    items: [
      { index: 0, itemGuid: '{ITEM-0}', live: true, takeGuid: '{TAKE-0}' },
      { index: 1, itemGuid: '{ITEM-1}', live: true, takeGuid: '{TAKE-1}' },
    ],
    recordId: 'record-7',
    ...over,
  };
}

const entity = (id: string, name: string): GuideEntity => ({ id, canonical_name: name, category: 'Character' }) as GuideEntity;
const ENTITIES = [entity('e-alice', 'Alice'), entity('e-queen', 'The Queen of Hearts'), entity('e-hatter', 'The Hatter')];
const CUES = [
  { id: 'q1', chapterId: 'chapter-1', paragraphId: 'p-1', quote_start: 0, quote_end: 12, quote_text: '', speaker_entity_id: 'e-queen' },
] as GuideDialogueCue[];

const sample = (id: string, characterId: string): VoiceSample =>
  ({ id, characterId, label: '', note: '', primary: false, createdAt: '2026-10-18T09:30:00Z', durationMs: 1000, bytes: 100, clipState: 'ok' }) as VoiceSample;
const list = (samples: VoiceSample[], perCharacter = 20): VoiceSamples =>
  ({
    samples,
    totals: { count: samples.length, bytes: 0 },
    limits: { minSeconds: 0.5, maxSeconds: 30, perCharacter, projectBytes: 1, labelUnits: 60, noteUnits: 500 },
  }) as VoiceSamples;
const saved = (id = 'a'.repeat(32), characterId = 'e-queen'): VoiceSampleAnswer => ({ status: 'saved', sample: sample(id, characterId) });

let page: ReturnType<typeof useEditingPage>;
let doc: ChapterDoc;
let current: WorkspaceAlignmentResult;
let existing: VoiceSamples;
let entities: () => Promise<GuideEntity[]>;
let cues: () => Promise<GuideDialogueCue[]>;
let mark: ReturnType<typeof vi.fn<(request: VoiceSampleMarkRequest) => Promise<VoiceSampleAnswer>>>;
let remove: ReturnType<typeof vi.fn<(id: string) => Promise<{ removed: number; bytes: number }>>>;
let toast: ReturnType<typeof vi.spyOn>;
let toastUndo: ReturnType<typeof vi.spyOn>;
let undo: (() => Promise<unknown>) | undefined;
let press: (code: string) => void;
let played: string[];

const keymap = defaultKeymap(COMMAND_CATALOG, false);

function Inner() {
  page = useEditingPage();
  doc = page.doc;
  const voice = useVoiceSample({
    chapterId: 'chapter-1',
    workspace: current,
    items: [
      { guid: '{ITEM-0}', sourceFile: 'take-1.wav' },
      { guid: '{ITEM-1}', sourceFile: 'take-2.wav' },
    ] as never,
    mediaUrl: (file) => `/media?path=${file}`,
    stopPlayback: idle.stop,
  });
  useEditingKeys({ handlers: { voiceSample: () => voice.open() }, keymap });
  return <SelectionBar playback={idle} end={60} />;
}

function mount() {
  const api = Object.assign(createMockApi(), {
    guideEntities: () => entities(),
    guideDialogueCues: () => cues(),
    voiceSamplesList: () => Promise.resolve(existing),
    voiceSampleMark: mark,
    voiceSampleRemove: remove,
  });
  let listener: ((e: GestureEvent) => void) | undefined;
  const source: InputSource = {
    subscribe(on) {
      listener = on;
      return () => void (listener = undefined);
    },
  };
  press = (code) => act(() => listener?.({ gesture: gesture('keyboard', code, []), target: null, preventDefault: () => {} }));
  return render(
    <ApiProvider api={api}>
      <CommandRouter source={source} keymap={keymap}>
        <CommandScope kind="page">
          <ContextMenuHost>
            <EditingPageProvider doc={marksDoc()}>
              <Inner />
            </EditingPageProvider>
          </ContextMenuHost>
        </CommandScope>
      </CommandRouter>
      <OverlayHost />
    </ApiProvider>,
  );
}

// The overlay service is one for the page: a dialog a test left open would be drawn again in the next.
const closeOverlays = () => act(() => overlay.getSnapshot().dialogs.forEach((d) => (d.kind === 'confirm' ? d.answer(false) : d.close())));
const flush = () => act(async () => {});
const select = async (anchor: string, head: string) => {
  await act(async () => page.dispatch({ type: 'select', anchor, head }));
};
const dialog = () => screen.getByRole('dialog');
const openDialog = async () => {
  press('KeyV');
  await screen.findByRole('dialog');
};
const saveButton = () => within(dialog()).getByRole('button', { name: 'Save sample' });
const characterSelect = () => within(dialog()).getByRole('combobox', { name: 'Character' }) as HTMLSelectElement;
const enter = (el: Element = characterSelect(), init: KeyboardEventInit = {}) => fireEvent.keyDown(el, { key: 'Enter', ...init });

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  play = vi.fn(() => (played.push(this.src), Promise.resolve()));
  pause = vi.fn();
}

beforeEach(() => {
  current = workspace();
  existing = list([]);
  entities = () => Promise.resolve(ENTITIES);
  cues = () => Promise.resolve(CUES);
  mark = vi.fn(() => Promise.resolve(saved()));
  remove = vi.fn(() => Promise.resolve({ removed: 1, bytes: 100 }));
  played = [];
  undo = undefined;
  vi.stubGlobal('Audio', FakeAudio);
  toast = vi.spyOn(overlay, 'toast');
  toastUndo = vi.spyOn(overlay, 'toastUndo').mockImplementation((_text, run) => void (undo = run));
});
afterEach(() => {
  act(() => stopSample());
  closeOverlays();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('marking a voice sample', () => {
  it('V with nothing selected says to select the words first and opens nothing', async () => {
    mount();
    press('KeyV');
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toast).toHaveBeenCalledWith('Select the words first.');
  });

  it("the three-action path: V, then Enter, saves the first speaker's sample", async () => {
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    expect(dialog().querySelector('[data-voice-sample-words]')?.textContent).toBe('Alice was');
    // The first word is in the Queen's quote, so she is the one chosen.
    expect(characterSelect().value).toBe('e-queen');
    enter();
    await flush();
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark.mock.calls[0][0]).toEqual({
      chapterId: 'chapter-1',
      itemGuid: '{ITEM-0}',
      takeGuid: '{TAKE-0}',
      sourceStart: 10,
      sourceEnd: 11,
      startKey: 'p-1:0',
      endKey: 'p-1:1',
      characterId: 'e-queen',
      label: '',
      note: '',
      makePrimary: true,
      alignmentRecordId: 'record-7',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toastUndo).toHaveBeenCalledWith('Saved voice sample for The Queen of Hearts.', expect.any(Function), { durationMs: 10_000 });
  });

  it('the character list: chapter speakers first, then the others, then Narration, under their headings', async () => {
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    const groups = within(dialog()).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('label'))).toEqual(['In this chapter', 'All characters']);
    expect(Array.from(characterSelect().options).map((o) => o.textContent)).toEqual(['The Queen of Hearts', 'Alice', 'The Hatter', 'Narration']);
  });

  it('the selection toolbar and the word menu both open the dialog', async () => {
    mount();
    await select('p-1:0', 'p-1:1');
    fireEvent.click(screen.getByRole('button', { name: 'Voice sample' }));
    await screen.findByRole('dialog');
    closeOverlays();
    cleanup();
    mount();
    await select('p-1:0', 'p-1:1');
    const sum = summarize(doc, ['p-1:0', 'p-1:1'], [], (t) => t);
    const items = buildWordMenu({ doc, keys: ['p-1:0', 'p-1:1'], summary: sum, play: vi.fn(), notify: vi.fn() }).groups.flat();
    const entry = items.find((i) => i.label === 'Mark as voice sample…');
    expect(entry).toBeDefined();
    await act(async () => entry?.onSelect());
    await screen.findByRole('dialog');
  });

  it('words in two takes are refused before asking', async () => {
    mount();
    await select('p-1:6', 'p-2:1');
    await openDialog();
    expect(within(dialog()).getByRole('alert').textContent).toBe(VOICE_SAMPLE_SENTENCES.spans_takes);
    expect(saveButton().getAttribute('disabled')).not.toBeNull();
    // Only the sentence, the words and the footer: nothing to choose when the words cannot be a sample.
    expect(within(dialog()).queryByRole('combobox', { name: 'Character' })).toBeNull();
    enter(dialog().querySelector('form') as HTMLElement);
    await flush();
    expect(mark).not.toHaveBeenCalled();
  });

  it('words that were not heard, and a stale check, are refused before asking', async () => {
    mount();
    await select('p-1:2', 'p-1:2');
    await openDialog();
    expect(within(dialog()).getByRole('alert').textContent).toBe(VOICE_SAMPLE_SENTENCES.not_heard);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    closeOverlays();
    cleanup();
    current = workspace({ state: 'stale' });
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    expect(within(dialog()).getByRole('alert').textContent).toBe(VOICE_SAMPLE_SENTENCES.stale_alignment);
  });

  it('a refusal from the host stays in the dialog, and Save can be pressed again', async () => {
    mark.mockResolvedValueOnce({ status: 'refused', reason: 'spans_cut', message: VOICE_SAMPLE_SENTENCES.spans_cut });
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    fireEvent.click(saveButton());
    await flush();
    expect(within(dialog()).getByRole('alert').textContent).toBe(VOICE_SAMPLE_SENTENCES.spans_cut);
    expect(saveButton().getAttribute('aria-busy')).toBeNull();
    fireEvent.click(saveButton());
    await flush();
    expect(mark).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each(Object.entries(VOICE_SAMPLE_SENTENCES))('every reason the host can give is shown as its own sentence: %s', async (reason, message) => {
    mark.mockResolvedValueOnce({ status: 'refused', reason: reason as VoiceSampleRefusalReason, message });
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    fireEvent.click(saveButton());
    await flush();
    expect(within(dialog()).getByRole('alert').textContent).toBe(message);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('a rejected save is a sentence in the dialog', async () => {
    mark.mockRejectedValueOnce(new Error('The project folder is read-only.'));
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    fireEvent.click(saveButton());
    await flush();
    expect(within(dialog()).getByRole('alert').textContent).toBe('The project folder is read-only.');
  });

  it('Save is busy while the host answers and a second press does nothing', async () => {
    let finish: (a: VoiceSampleAnswer) => void = () => {};
    mark.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    fireEvent.click(saveButton());
    await flush();
    expect(saveButton().getAttribute('aria-busy')).toBe('true');
    fireEvent.click(saveButton());
    enter();
    enter();
    await flush();
    expect(mark).toHaveBeenCalledTimes(1);
    await act(async () => finish(saved()));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a character at 19 of 20 says so and saves, and at 20 says Delete one first and Save is off', async () => {
    existing = list(Array.from({ length: 19 }, (_, i) => sample(`${i}`.padStart(32, '0'), 'e-queen')));
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    expect(dialog().querySelector('[data-voice-sample-count]')?.textContent).toBe('19 of 20 samples');
    expect(saveButton().getAttribute('disabled')).toBeNull();
    closeOverlays();
    cleanup();
    existing = list(Array.from({ length: 20 }, (_, i) => sample(`${i}`.padStart(32, '0'), 'e-queen')));
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    expect(dialog().querySelector('[data-voice-sample-count]')?.textContent).toBe('The Queen of Hearts has 20 samples. Delete one first.');
    expect(saveButton().getAttribute('disabled')).not.toBeNull();
    fireEvent.change(characterSelect(), { target: { value: 'e-alice' } });
    expect(dialog().querySelector('[data-voice-sample-count]')?.textContent).toBe('0 of 20 samples');
    expect(saveButton().getAttribute('disabled')).toBeNull();
  });

  it("Make primary is on for a character's first sample and the narrator's choice stays", async () => {
    existing = list([sample('b'.repeat(32), 'e-alice')]);
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    const box = () => within(dialog()).getByRole('checkbox', { name: /Make primary for/ });
    expect(box().getAttribute('aria-checked')).toBe('true');
    fireEvent.change(characterSelect(), { target: { value: 'e-alice' } });
    expect(box().getAttribute('aria-checked')).toBe('false');
    fireEvent.click(box());
    fireEvent.change(characterSelect(), { target: { value: 'e-hatter' } });
    expect(box().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(box());
    fireEvent.change(characterSelect(), { target: { value: 'e-queen' } });
    expect(box().getAttribute('aria-checked')).toBe('false');
  });

  it('a label and note in any script are sent as typed, trimmed', async () => {
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    fireEvent.change(within(dialog()).getByRole('textbox', { name: /Label/ }), { target: { value: '  שלום 🦎 اليوم  ' } });
    fireEvent.change(within(dialog()).getByRole('textbox', { name: /Note/ }), { target: { value: ' pitch up\nno breaths ' } });
    fireEvent.click(saveButton());
    await flush();
    expect(mark.mock.calls[0][0]).toMatchObject({ label: 'שלום 🦎 اليوم', note: 'pitch up\nno breaths' });
  });

  it('Enter in the note is a new line and Ctrl+Enter saves from it', async () => {
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    const note = within(dialog()).getByRole('textbox', { name: /Note/ });
    enter(note);
    await flush();
    expect(mark).not.toHaveBeenCalled();
    enter(note, { ctrlKey: true });
    await flush();
    expect(mark).toHaveBeenCalledTimes(1);
  });

  it('Undo removes the sample', async () => {
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    enter();
    await flush();
    await act(async () => void (await undo?.()));
    expect(remove).toHaveBeenCalledWith('a'.repeat(32));
  });

  it('a failed Undo is a toast', async () => {
    remove.mockRejectedValueOnce(new Error('The voice sample could not be removed.'));
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    enter();
    await flush();
    let result: unknown;
    await act(async () => void (result = await undo?.()));
    expect(result).toEqual({ ok: false, refusal: { reason: 'The voice sample could not be removed.' } });
  });

  it('marking the same stretch again says so and offers no Undo', async () => {
    existing = list([sample('a'.repeat(32), 'e-queen')]);
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    enter();
    await flush();
    expect(toast).toHaveBeenCalledWith('That stretch is already a voice sample for The Queen of Hearts.');
    expect(toastUndo).not.toHaveBeenCalled();
  });

  it('a failed read is a note and the dialog still opens, with Narration to choose', async () => {
    entities = () => Promise.reject(new Error('no story bible'));
    cues = () => Promise.reject(new Error('no cues'));
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    expect(dialog().querySelector('[data-voice-sample-notice]')?.textContent).toBe(
      "Couldn't read the Story Bible's characters or the Story Bible's speakers, so the list may be incomplete.",
    );
    expect(Array.from(characterSelect().options).map((o) => o.textContent)).toEqual(['Narration']);
    enter();
    await flush();
    expect(mark.mock.calls[0][0]).toMatchObject({ characterId: 'narration' });
  });

  it('Play range plays the stretch of the take and again stops it', async () => {
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Play range' }));
    await flush();
    expect(played).toEqual(['/media?path=take-1.wav']);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Stop' }));
    expect(within(dialog()).getByRole('button', { name: 'Play range' })).toBeDefined();
    await waitFor(() => expect(idle.stop).toHaveBeenCalled());
  });

  it('Play range stops a voice sample that is playing', async () => {
    mount();
    await select('p-1:0', 'p-1:1');
    await openDialog();
    act(() => playSample('c'.repeat(32), { by: Symbol('test'), url: '/media?sample=c', report: vi.fn() }));
    expect(samplePlayerState().status).toBe('loading');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Play range' }));
    await flush();
    expect(samplePlayerState().status).toBe('idle');
    expect(played).toContain('/media?path=take-1.wav');
  });
});
