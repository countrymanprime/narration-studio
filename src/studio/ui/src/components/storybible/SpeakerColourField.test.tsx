// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { speakerColorIndex } from '../primitives/speakerColor';
import { TooltipProvider } from '../primitives/Tooltip';
import { SpeakerColourField } from './SpeakerColourField';

afterEach(cleanup);

const HUES = ['Green', 'Blue', 'Violet', 'Red', 'Brown', 'Teal', 'Rose'];
const entry = (speaker_color?: number) => ({ id: 'e1', speaker_color });
const automaticName = `Automatic (${HUES[speakerColorIndex('e1') - 1]})`;

function renderField(props: Partial<Parameters<typeof SpeakerColourField>[0]> & { entity: { id: string; speaker_color?: number } }) {
  const onChange = vi.fn();
  const view = render(
    <TooltipProvider>
      <SpeakerColourField speaks onChange={onChange} {...props} />
    </TooltipProvider>,
  );
  return { onChange, container: view.container };
}
const group = () => screen.getByRole('radiogroup', { name: 'Speaker colour' });
const radio = (name: string) => screen.getByRole('radio', { name });
const checkedName = () =>
  screen
    .getAllByRole('radio')
    .find((el) => el.getAttribute('aria-checked') === 'true')
    ?.getAttribute('aria-label');

describe('SpeakerColourField', () => {
  it('read-only, names the colour as text and has no control', () => {
    renderField({ entity: entry(4), readOnly: true });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Red')).toBeTruthy();
    cleanup();
    renderField({ entity: entry(), readOnly: true });
    expect(screen.getByText(automaticName)).toBeTruthy();
  });

  it('a speaker colour is offered for any type that can speak, and not for one that cannot', () => {
    const { container } = renderField({ entity: entry(), speaks: false });
    expect(container.innerHTML).toBe('');
    cleanup();
    renderField({ entity: entry() });
    expect(group()).toBeTruthy();
    expect(screen.getByText('Speaker colour')).toBeTruthy();
  });

  it('shows only for a speaking category', () => {
    // A colour chosen while the type could speak stays stored, but is not offered once the type cannot.
    const { container } = renderField({ entity: entry(4), speaks: false });
    expect(container.innerHTML).toBe('');
    cleanup();
    renderField({ entity: entry(4) });
    expect(checkedName()).toBe('Red');
  });

  it('offers Automatic, named with the hue it resolves to, and seven named hues, as swatches and not a select', () => {
    renderField({ entity: entry() });
    expect(screen.getAllByRole('radio').map((el) => el.getAttribute('aria-label'))).toEqual([automaticName, ...HUES]);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('reports a hue as 1..7 and Automatic as 0', async () => {
    const { onChange } = renderField({ entity: entry(3) });
    expect(checkedName()).toBe('Violet');
    await userEvent.click(radio('Brown'));
    expect(onChange).toHaveBeenLastCalledWith(5);
    await userEvent.click(radio(automaticName));
    expect(onChange).toHaveBeenLastCalledWith(0);
    await userEvent.click(radio('Green'));
    expect(onChange).toHaveBeenLastCalledWith(1);
    await userEvent.click(radio('Rose'));
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it('reports each arrow-key step as the hue reached', async () => {
    const { onChange } = renderField({ entity: entry(3) });
    radio('Violet').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  it('reads Automatic when no colour is chosen', () => {
    renderField({ entity: entry() });
    expect(checkedName()).toBe(automaticName);
  });

  it('while the host call runs, says it is busy, keeps focus and reports nothing', async () => {
    const { onChange } = renderField({ entity: entry(3), disabled: true });
    expect(group().getAttribute('aria-busy')).toBe('true');
    radio('Violet').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(radio('Violet'));
    await userEvent.click(radio('Green'));
    expect(onChange).not.toHaveBeenCalled();
    expect(checkedName()).toBe('Violet');
  });
});
