// @vitest-environment jsdom
// The state matrix (definition of done, rule 3) for "Who is in Num N?" and "Who records …?", written with the change:
//
//   empty (no other track, no Narrator)   'with no other track the existing choice is off, and with no Narrator the Narrator choice is'
//   one, many ticked                      'the name follows the ticks: one character names it, none or several make Extras'
//   huge (cast)                           'a long cast scrolls inside its own capped group'
//   loading / busy                        'Add track is busy until the host answers, and a second press sends nothing more'
//   refused                               'a refused add keeps the dialog open with what was typed'
//   failed                                'a failed add keeps the dialog open' (the hook's toast says why: useBoothVoices.test.tsx)
//   stale (a name the folder has)         'a name a track of the chapter has is refused before anything is sent'
//   long, RTL, emoji text                 'a name in any script is kept as typed and sent trimmed'
//   rapid double-fire                     'Add track is busy until the host answers, and a second press sends nothing more'
//   leave mid-action                      the page closes the dialog on another chapter (BoothNextPage's effect on recordId); not tested here
//   reload mid-action                     not tested: the dialog holds no saved state; a track the host added is listed by BoothVoiceGet
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Voice } from '../../engine/voices';
import { castOf } from './whoIsIn';
import { WhoIsInDialog, type WhoAsk, type WhoIsInDialogProps } from './WhoIsInDialog';

afterEach(cleanup);

const voices: Voice[] = [
  { guid: 'n', name: 'Narrator', key: '0', narrator: true, characters: [] },
  { guid: 'a', name: 'Alice', key: '1', narrator: false, characters: [{ id: 'alice', name: 'Alice', source: 'name' }] },
  { guid: 'g', name: 'Gardeners', key: '2', narrator: false, characters: [] },
];
const cast = castOf({
  inThisChapter: [
    { id: 'alice', name: 'Alice' },
    { id: 'king', name: 'King of Hearts' },
    { id: 'knave', name: 'Knave of Hearts' },
  ],
  characters: [
    { id: 'alice', name: 'Alice' },
    { id: 'duchess', name: 'Duchess' },
  ],
  lines: new Map([
    ['king', 12],
    ['knave', 1],
    ['alice', 30],
  ]),
  voices,
});

function show(ask: WhoAsk, over: Partial<WhoIsInDialogProps> = {}) {
  const props: WhoIsInDialogProps = {
    ask,
    voices,
    cast,
    onAdd: vi.fn(async () => true),
    onUse: vi.fn(async () => true),
    onNarrator: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<WhoIsInDialog {...props} />);
  return props;
}

const nameField = () => screen.getByRole('textbox', { name: 'Track name' }) as HTMLInputElement;

describe('Who is in Num N?', () => {
  it("asks about the key pressed, with the chapter's speakers with no track ticked and the new track's key", async () => {
    const props = show({ kind: 'key', key: 5 });
    const dialog = screen.getByRole('dialog', { name: 'Who is in Num 5?' });
    const here = within(dialog).getByRole('group', { name: 'In this chapter' });
    const rows = within(here).getAllByRole('checkbox');
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['false', 'true', 'true']);
    expect(here.textContent).toMatch(/Alice.*on Num 1.*King of Hearts.*12 lines.*Knave of Hearts.*1 line/);
    expect(within(dialog).getByRole('group', { name: 'Elsewhere in the book' }).textContent).toContain('Duchess');
    // The new track is the folder's last child: the next free key, not the key pressed.
    expect(within(dialog).getByRole('img', { name: 'Num 3' })).toBeTruthy();
    expect(nameField().value).toBe('Extras');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add track' }));
    expect(props.onAdd).toHaveBeenCalledWith('Extras', ['king', 'knave']);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('the name follows the ticks: one character names it, none or several make Extras, until the narrator types one', async () => {
    show({ kind: 'key', key: 5 });
    await userEvent.click(screen.getByRole('checkbox', { name: /Knave of Hearts/ }));
    expect(nameField().value).toBe('King of Hearts');
    await userEvent.click(screen.getByRole('checkbox', { name: /King of Hearts/ }));
    expect(nameField().value).toBe('Extras');
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Court');
    await userEvent.click(screen.getByRole('checkbox', { name: /Duchess/ }));
    expect(nameField().value).toBe('Court');
  });

  it('a name a track of the chapter has is refused before anything is sent, and so is a blank one', async () => {
    const props = show({ kind: 'key', key: 5 });
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), '  gardeners ');
    expect(screen.getByText('This chapter already has a track named “gardeners”.')).toBeTruthy();
    const add = screen.getByRole('button', { name: 'Add track' });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    await userEvent.clear(nameField());
    expect(screen.getByText('The new track needs a name.')).toBeTruthy();
    await userEvent.type(nameField(), '{Enter}');
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it('a name in any script is kept as typed and sent trimmed', async () => {
    const props = show({ kind: 'key', key: 5 });
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), '  ملكة القلوب 👑  ');
    await userEvent.click(screen.getByRole('button', { name: 'Add track' }));
    expect(props.onAdd).toHaveBeenCalledWith('ملكة القلوب 👑', ['king', 'knave']);
  });

  it('Add track is busy until the host answers, and a second press sends nothing more', async () => {
    let answer: (added: boolean) => void = () => undefined;
    const onAdd = vi.fn(() => new Promise<boolean>((resolve) => (answer = resolve)));
    const props = show({ kind: 'key', key: 5 }, { onAdd });
    const add = screen.getByRole('button', { name: 'Add track' });
    await userEvent.click(add);
    await userEvent.click(add);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(add.getAttribute('aria-busy')).toBe('true');
    await act(async () => answer(true));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('a refused add keeps the dialog open with what was typed', async () => {
    const props = show({ kind: 'key', key: 5 }, { onAdd: vi.fn(async () => false) });
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Court');
    await userEvent.click(screen.getByRole('button', { name: 'Add track' }));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(nameField().value).toBe('Court');
    expect((screen.getByRole('button', { name: 'Add track' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('an existing track takes the ticked characters, and the Narrator records them this time with nothing assigned', async () => {
    const props = show({ kind: 'key', key: 5 });
    await userEvent.click(screen.getByRole('radio', { name: 'An existing track' }));
    expect(screen.queryByRole('textbox', { name: 'Track name' })).toBeNull();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Track' }), 'g');
    await userEvent.click(screen.getByRole('button', { name: 'Use this track' }));
    expect(props.onUse).toHaveBeenCalledWith(voices[2], ['king', 'knave']);
    cleanup();
    const again = show({ kind: 'key', key: 5 });
    await userEvent.click(screen.getByRole('radio', { name: /The Narrator, this time/ }));
    expect(screen.queryByRole('group', { name: 'In this chapter' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Arm' }));
    expect(again.onNarrator).toHaveBeenCalledWith(voices[0]);
    expect(again.onAdd).not.toHaveBeenCalled();
  });

  it('with no other track the existing choice is off, and with no Narrator the Narrator choice is', () => {
    show({ kind: 'key', key: 1 }, { voices: [voices[0]] });
    expect(screen.getByText('This chapter has no other track yet.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'An existing track' }).hasAttribute('data-disabled')).toBe(true);
    cleanup();
    show({ kind: 'key', key: 1 }, { voices: [voices[1]] });
    expect(screen.getByText('This chapter has no track named Narrator.')).toBeTruthy();
  });

  it('Cancel and Escape close it and send nothing', async () => {
    const props = show({ kind: 'key', key: 5 });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it('a long cast scrolls inside its own capped group', () => {
    const many = Array.from({ length: 300 }, (_, at) => ({ id: `c${at}`, name: `Character ${at}` }));
    show({ kind: 'key', key: 5 }, { cast: castOf({ inThisChapter: many, characters: [], lines: new Map(), voices }) });
    const group = screen.getByRole('group', { name: 'In this chapter' });
    expect(group.className).toContain('max-h-');
    expect(group.className).toContain('overflow-auto');
  });
});

describe('Who records a character with no track?', () => {
  const king = cast.inChapter.find((character) => character.id === 'king')!;

  it('names the character, offers a track named after it, and sends it alone', async () => {
    const props = show({ kind: 'character', character: king });
    expect(screen.getByRole('dialog', { name: 'Who records King of Hearts?' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'In this chapter' })).toBeNull();
    expect(nameField().value).toBe('King of Hearts');
    await userEvent.click(screen.getByRole('button', { name: 'Add track' }));
    expect(props.onAdd).toHaveBeenCalledWith('King of Hearts', ['king']);
  });

  it("the control's after-stop link opens it on an existing track", async () => {
    const props = show({ kind: 'character', character: king, choice: 'existing' });
    expect((screen.getByRole('radio', { name: 'An existing track' }) as HTMLInputElement).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Use this track' }));
    expect(props.onUse).toHaveBeenCalledWith(voices[1], ['king']);
  });
});
