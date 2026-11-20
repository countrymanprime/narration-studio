// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScopedSettingField } from '../../api/contracts/system';
import { TooltipProvider } from '../primitives/Tooltip';
import { ScopedSetting } from './ScopedSetting';

afterEach(cleanup);

const FIELD: ScopedSettingField = {
  key: 'model_size',
  label: 'Model size',
  kind: 'choice',
  choices: ['base', 'small'],
  value: '',
  isSet: false,
  effectiveValue: 'base',
  effectiveSource: 'default',
};

function renderSetting(field: ScopedSettingField, change = vi.fn()) {
  render(
    <TooltipProvider>
      <ScopedSetting field={field} scope="global" value={field.value} change={change} onClearOverride={() => undefined} />
    </TooltipProvider>,
  );
  return change;
}

describe('ScopedSetting controls', () => {
  it('shows a choice as a named select and reports the chosen value', () => {
    const change = renderSetting(FIELD);
    const select = screen.getByRole('combobox', { name: 'Model size' }) as HTMLSelectElement;
    expect(select.value).toBe('base');
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['base', 'small']);
    fireEvent.change(select, { target: { value: 'small' } });
    expect(change).toHaveBeenCalledWith('small');
  });

  it('shows text as a named text box and reports what is typed', () => {
    const change = renderSetting({ ...FIELD, key: 'note', label: 'Note label', kind: 'text', choices: [], effectiveValue: 'Note' });
    const box = screen.getByRole('textbox', { name: 'Note label' }) as HTMLInputElement;
    expect(box.value).toBe('Note');
    fireEvent.change(box, { target: { value: 'Narrator note' } });
    expect(change).toHaveBeenCalledWith('Narrator note');
  });

  it('reports spaces alone as empty, so a text setting is never saved as "  " (#3231)', () => {
    const change = renderSetting({ ...FIELD, key: 'note', label: 'Note label', kind: 'text', choices: [], effectiveValue: 'Note' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Note label' }), { target: { value: '   ' } });
    expect(change).toHaveBeenCalledWith('');
  });

  const colourField = (effectiveValue: string) => ({ ...FIELD, key: 'color_note', label: 'Note color', kind: 'color' as const, choices: [], effectiveValue });

  it('shows a colour as a picker and a hex box that store the value without the hash, in capitals', () => {
    const change = renderSetting(colourField('ffd54f'));
    const picker = screen.getByLabelText('Note color') as HTMLInputElement;
    expect(picker.type).toBe('color');
    expect(picker.value).toBe('#ffd54f');
    const box = screen.getByRole('textbox', { name: 'Note color hex' });
    fireEvent.change(box, { target: { value: '#ff8800' } });
    fireEvent.blur(box);
    expect(change).toHaveBeenLastCalledWith('FF8800');
  });

  it('shows the stored colour in the picker and reports a picked one once, when the picker closes', () => {
    const change = renderSetting(colourField('FFD54F'));
    const picker = screen.getByLabelText('Note color') as HTMLInputElement;
    expect(picker.value).toBe('#ffd54f');
    fireEvent.input(picker, { target: { value: '#a1b2c3' } });
    expect(change).not.toHaveBeenCalled();
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    expect(change).toHaveBeenCalledExactlyOnceWith('A1B2C3');
  });

  // The form's Save button saves the draft as it stands, so a code is not handed over per key (#3680, S5): only when the box is left or Enter
  // is pressed. Text left in the box that is not a colour is handed over too, as an out-of-range number is: the form then holds an unsaved
  // value, asks before the narrator leaves, and the host refuses it on Save (B7).
  it('reports a typed colour when the box is left or Enter is pressed, never per key', () => {
    const change = renderSetting(colourField('FFD54F'));
    const box = screen.getByRole('textbox', { name: 'Note color hex' });
    fireEvent.change(box, { target: { value: 'FF8' } });
    fireEvent.change(box, { target: { value: 'ff88' } });
    expect(change).not.toHaveBeenCalled();
    fireEvent.blur(box);
    expect(change).toHaveBeenCalledExactlyOnceWith('FF88');
    expect(box.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(box, { target: { value: 'ff8800' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(change).toHaveBeenLastCalledWith('FF8800');
    expect(change).toHaveBeenCalledTimes(2);
  });

  it('draws a form value that is not a colour as typed, marked, with a grey picker', () => {
    renderSetting({ ...colourField('FFD54F'), value: '4D5E6' });
    const box = screen.getByRole('textbox', { name: 'Note color hex' }) as HTMLInputElement;
    expect(box.value).toBe('4D5E6');
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByLabelText('Note color') as HTMLInputElement).value).toBe('#808080');
  });

  // R5 (#3680): the form's value was tidied a second time before it was judged, and " abcdef" then read as a colour.
  it.each([' abcdef', 'abcdef ', '#abcdef', '# abcdef', 'GGGGGG', 'ﬀﬀﬀ'])('refused text held by the form is marked, whatever it normalises to: %j', (held) => {
    renderSetting({ ...colourField('FFD54F'), value: held });
    const box = screen.getByRole('textbox', { name: 'Note color hex' }) as HTMLInputElement;
    expect(box.value).toBe(held);
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByLabelText('Note color') as HTMLInputElement).value).toBe('#808080');
  });

  it.each(['# abcdef', ' # abcdef', '##abcdef'])('hands %j to the form as text that is not a colour', (typed) => {
    const change = renderSetting(colourField('FFD54F'));
    const box = screen.getByRole('textbox', { name: 'Note color hex' });
    fireEvent.change(box, { target: { value: typed } });
    fireEvent.blur(box);
    expect(change).toHaveBeenCalledTimes(1);
    expect(change.mock.calls[0]![0]).toBe(typed.trim());
    expect(box.getAttribute('aria-invalid')).toBe('true');
  });

  function HeldByForm({ onChange }: { onChange: (value: string) => void }) {
    const [value, setValue] = useState('FFD54F');
    return (
      <TooltipProvider>
        <ScopedSetting
          field={colourField('FFD54F')}
          scope="global"
          value={value}
          change={(next) => {
            onChange(next);
            setValue(next);
          }}
          onClearOverride={() => undefined}
        />
      </TooltipProvider>
    );
  }

  it('Escape in a refused box puts the stored colour back', () => {
    const onChange = vi.fn();
    render(<HeldByForm onChange={onChange} />);
    const box = screen.getByRole('textbox', { name: 'Note color hex' }) as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'GGGGGG' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(box.value).toBe('GGGGGG');
    // A second refusal over the first does not make the first the colour to go back to.
    fireEvent.change(box, { target: { value: 'red' } });
    fireEvent.blur(box);
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(onChange.mock.calls).toEqual([['GGGGGG'], ['red'], ['FFD54F']]);
    expect(box.value).toBe('FFD54F');
    expect(box.getAttribute('aria-invalid')).toBeNull();
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('a draft does not follow a scope switch', () => {
    const field = colourField('FFD54F');
    const draw = (scope: 'global' | 'project') => (
      <TooltipProvider>
        <ScopedSetting field={field} scope={scope} value="" change={() => undefined} onClearOverride={() => undefined} />
      </TooltipProvider>
    );
    const { rerender } = render(draw('global'));
    const typed = screen.getByRole('textbox', { name: 'Note color hex' });
    fireEvent.change(typed, { target: { value: '4D5E6' } });
    fireEvent.blur(typed);
    rerender(draw('project'));
    const box = screen.getByRole('textbox', { name: 'Note color hex' }) as HTMLInputElement;
    expect(box.value).toBe('FFD54F');
    expect(box.getAttribute('aria-invalid')).toBeNull();
  });

  const drawColour = (scope: 'global' | 'project', change = vi.fn()) => {
    render(
      <TooltipProvider>
        <ScopedSetting field={colourField('FFD54F')} scope={scope} value="" change={change} onClearOverride={() => undefined} />
      </TooltipProvider>,
    );
    return change;
  };

  it('an emptied colour box under This project reports "", which is "not set"', () => {
    const change = drawColour('project');
    const box = screen.getByRole('textbox', { name: 'Note color hex' });
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.blur(box);
    expect(change).toHaveBeenCalledExactlyOnceWith('');
    expect(box.getAttribute('aria-invalid')).toBeNull();
  });

  // C6 (#3680): the host refuses '' for a colour, and Global has no "not set" to fall back to.
  it('an emptied colour under Global is refused in the box and not sent', () => {
    const change = drawColour('global');
    const box = screen.getByRole<HTMLInputElement>('textbox', { name: 'Note color hex' });
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.blur(box);
    expect(change).not.toHaveBeenCalled();
    expect(box.value).toBe('');
    expect(box.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(box.getAttribute('aria-describedby')!)?.textContent).toBe('Six hex digits, like B5473C');
    // Enter in the marked box does not submit the form it sits in, and Escape puts the colour back.
    expect(fireEvent.keyDown(box, { key: 'Enter' })).toBe(false);
    expect(change).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box.value).toBe('FFD54F');
    expect(box.getAttribute('aria-invalid')).toBeNull();
  });

  it('shows a neutral grey in the picker for an unset colour and "Not set" in the box', () => {
    renderSetting(colourField(''));
    expect((screen.getByLabelText('Note color') as HTMLInputElement).value).toBe('#808080');
    expect(screen.getByPlaceholderText('Not set')).toBeTruthy();
  });

  it('shows a bool as a switch named by the setting, on when the stored value is "true", and stores "true" or "false"', () => {
    const change = renderSetting({ ...FIELD, key: 'notify_done', label: 'Notify when a job finishes', kind: 'bool', choices: [], effectiveValue: 'true' });
    const toggle = screen.getByRole('switch', { name: 'Notify when a job finishes' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(change).toHaveBeenLastCalledWith('false');
    cleanup();
    const changeOn = renderSetting({ ...FIELD, key: 'notify_done', label: 'Notify when a job finishes', kind: 'bool', choices: [], effectiveValue: 'false' });
    const off = screen.getByRole('switch', { name: 'Notify when a job finishes' });
    expect(off.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(off);
    expect(changeOn).toHaveBeenLastCalledWith('true');
  });

  it('reads the value being edited before the saved one, so the switch follows a click', () => {
    renderSetting({ ...FIELD, key: 'notify_done', label: 'Notify me', kind: 'bool', choices: [], value: 'false', effectiveValue: 'true' });
    expect(screen.getByRole('switch', { name: 'Notify me' }).getAttribute('aria-checked')).toBe('false');
  });

  it('treats anything but "true" as off, so a value the host never validated cannot turn a switch on', () => {
    renderSetting({ ...FIELD, key: 'notify_done', label: 'Notify me', kind: 'bool', choices: [], effectiveValue: 'yes' });
    expect(screen.getByRole('switch', { name: 'Notify me' }).getAttribute('aria-checked')).toBe('false');
  });

  it('offers Reset on a project bool that has an override', () => {
    const clear = vi.fn();
    render(
      <TooltipProvider>
        <ScopedSetting
          field={{ ...FIELD, key: 'notify_done', label: 'Notify me', kind: 'bool', choices: [], isSet: true, value: 'false' }}
          scope="project"
          value="false"
          change={vi.fn()}
          onClearOverride={clear}
        />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('offers Reset on a project setting that has an override, and reports it', () => {
    const clear = vi.fn();
    render(
      <TooltipProvider>
        <ScopedSetting field={{ ...FIELD, isSet: true, value: 'small' }} scope="project" value="small" change={vi.fn()} onClearOverride={clear} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('offers no Reset on a global setting or on a project setting with no override', () => {
    renderSetting({ ...FIELD, isSet: true });
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
    cleanup();
    render(
      <TooltipProvider>
        <ScopedSetting field={FIELD} scope="project" value="" change={vi.fn()} onClearOverride={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });
  describe('a number', () => {
    const LIMIT: ScopedSettingField = {
      ...FIELD,
      key: 'true_peak_dbtp_max',
      label: 'True peak, highest',
      kind: 'number',
      choices: [],
      effectiveValue: '',
      effectiveSource: 'hardcoded',
      number: { min: -60, max: 0, step: 0.1, unit: 'dBTP' },
    };
    const renderNumber = (field: ScopedSettingField, scope: 'global' | 'project', value = field.value, change = vi.fn()) => {
      render(
        <TooltipProvider>
          <ScopedSetting field={field} scope={scope} value={value} change={change} onClearOverride={vi.fn()} />
        </TooltipProvider>,
      );
      return change;
    };

    it('is a named decimal box with its unit and range, and reports what is typed', () => {
      const change = renderNumber(LIMIT, 'global');
      const box = screen.getByRole('textbox', { name: 'True peak, highest' }) as HTMLInputElement;
      expect(box.inputMode).toBe('decimal');
      expect(box.value).toBe('');
      expect(box.placeholder).toBe('Not set');
      expect(screen.getByText('dBTP')).toBeTruthy();
      expect(screen.getByText('From -60 to 0 dBTP')).toBeTruthy();
      fireEvent.change(box, { target: { value: '-3' } });
      expect(change).toHaveBeenCalledWith('-3');
    });

    it('can be emptied, since an empty number is "not set", not the inherited value typed back in', () => {
      renderNumber({ ...LIMIT, value: '-3', isSet: true, effectiveValue: '-3', effectiveSource: 'global' }, 'global', '');
      expect((screen.getByRole('textbox', { name: 'True peak, highest' }) as HTMLInputElement).value).toBe('');
    });

    it('shows the inherited value as the placeholder of an unset project field', () => {
      renderNumber({ ...LIMIT, effectiveValue: '-3', effectiveSource: 'global' }, 'project');
      expect(screen.getByPlaceholderText('Inherits -3')).toBeTruthy();
      cleanup();
      // A global field never shows a project's value as if it were inherited.
      renderNumber({ ...LIMIT, effectiveValue: '-1', effectiveSource: 'project' }, 'global');
      expect(screen.getByPlaceholderText('Not set')).toBeTruthy();
      cleanup();
      // A project override being cleared inherits a value the page does not know yet.
      renderNumber({ ...LIMIT, value: '-1', isSet: true, effectiveValue: '-1', effectiveSource: 'project' }, 'project', '');
      expect(screen.getByPlaceholderText('Inherits Global')).toBeTruthy();
    });

    it('says what is wrong with a value that cannot be saved, in place of the range', () => {
      renderNumber(LIMIT, 'global', '5');
      const box = screen.getByRole('textbox', { name: 'True peak, highest' });
      expect(box.getAttribute('aria-invalid')).toBe('true');
      const message = screen.getByText('Enter a value from -60 to 0 dBTP.');
      expect(box.getAttribute('aria-describedby')).toBe(message.id);
      expect(screen.queryByText('From -60 to 0 dBTP')).toBeNull();
    });
  });

  it('shows the update channel in words, not as the stored names', () => {
    renderSetting({ ...FIELD, key: 'channel', label: 'Update channel', choices: ['candidates', 'stable'], effectiveValue: 'candidates' });
    const select = screen.getByRole('combobox', { name: 'Update channel' }) as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['Candidates and stable', 'Stable only']);
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['candidates', 'stable']);
  });
});

// Alignment audit (XSE2-22): number boxes are one width with or without a unit, and a label's hint icon stays on its last word's line.
describe('ScopedSetting hints (#2980)', () => {
  const chunk = (label: string): ScopedSettingField => ({ ...FIELD, key: 'chunk_seconds', label, choices: ['60'], effectiveValue: '60' });
  const hint = (tool: string, label: string) => {
    render(
      <TooltipProvider>
        <ScopedSetting tool={tool} field={chunk(label)} scope="global" value="" change={vi.fn()} onClearOverride={() => undefined} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More information' }));
    return screen.getByRole('tooltip').textContent ?? '';
  };
  it('gives the two chunk_seconds keys each its own hint', () => {
    const compare = hint('TranscriptCompare', 'Compare chunk length');
    cleanup();
    const coverage = hint('RecordingCoverage', 'Coverage chunk length');
    expect(compare).toMatch(/compar/i);
    expect(coverage).toMatch(/recording check/i);
    expect(compare).not.toBe(coverage);
  });
});

describe('ScopedSetting layout', () => {
  const number = (unit?: string): ScopedSettingField => ({
    ...FIELD,
    key: unit ? 'gap' : 'share',
    label: unit ? 'Longest run of missing words allowed' : 'Share of each paragraph that must be read',
    kind: 'number',
    choices: [],
    effectiveValue: '3',
    number: { min: 0, max: 200, step: 1, unit: unit ?? '' },
  });

  it('draws a number box 10rem wide whether or not a unit follows it', () => {
    renderSetting(number('words'));
    renderSetting(number());
    const boxes = screen.getAllByRole('textbox');
    for (const box of boxes) expect(box.closest('[class*="w-40"]')).toBeTruthy();
    for (const box of boxes) expect(box.closest('[class*="flex-[1_1_10rem]"]')).toBeNull();
  });

  it("keeps the hint icon on the line of the label's last word", () => {
    renderSetting(number());
    // From `md` the last word and the icon share one nowrap span, so no line breaks between them; below `md` the icon is pinned to the
    // row's right edge (the alignment audit's A4 at 390 px).
    const last = screen.getByText(/^read$/);
    expect(last.className).toContain('md:whitespace-nowrap');
    expect(last.querySelector('button, [role="button"], svg')).toBeTruthy();
  });
});
