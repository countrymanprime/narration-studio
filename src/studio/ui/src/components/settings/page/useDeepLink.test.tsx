// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChoiceControl } from '../registry/types';
import { SettingChoice } from '../value/SettingChoice';
import { useDeepLink } from './useDeepLink';

afterEach(cleanup);

const OPTIONS = [
  { value: 'tiny', label: 'Tiny' },
  { value: 'small', label: 'Small' },
];

/** A settings row as the page draws it: the row's "?" comes before its control. */
function LinkedRow({ children, onDone = () => undefined }: { children: ReactNode; onDone?: () => void }) {
  useDeepLink('stt.liveModel', true, onDone, () => undefined);
  return (
    <div data-row="stt.liveModel">
      <button type="button">About Live model</button>
      {children}
    </div>
  );
}

const choice = (control: ChoiceControl) => (
  <SettingChoice control={control} id="set-stt.liveModel" label="Live model" value="small" options={OPTIONS} onChange={() => undefined} />
);

describe('a link to one setting', () => {
  it('focuses the chosen segment of a segmented row, not the row’s "?" or its first segment', () => {
    render(<LinkedRow>{choice('segmented')}</LinkedRow>);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Small' }));
  });

  it('focuses the chosen option of a radio row', () => {
    render(<LinkedRow>{choice('radio')}</LinkedRow>);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Small' }));
  });

  it('focuses the select of a select row, by the row’s id', () => {
    render(<LinkedRow>{choice('select')}</LinkedRow>);
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Live model' }));
  });

  it('focuses the first control of a "Set on a page" entry, not the pressed scope switch of its panel', () => {
    function LinkedEntry() {
      useDeepLink(
        'ps.preview',
        true,
        () => undefined,
        () => undefined,
      );
      return (
        <div data-page-setting="ps.preview">
          <button type="button">Change it here for now</button>
          <button type="button" aria-pressed="true">
            Global
          </button>
        </div>
      );
    }
    render(<LinkedEntry />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change it here for now' }));
  });

  it('falls back to the first control of a row whose body has neither that id nor a chosen option', () => {
    const onDone = vi.fn();
    render(
      <LinkedRow onDone={onDone}>
        <input aria-label="A custom body" />
      </LinkedRow>,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'About Live model' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
