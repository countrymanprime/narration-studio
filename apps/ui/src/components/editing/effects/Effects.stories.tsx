import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { createMockDawClient } from '../../../ports/daw';
import { PortOverrides } from '../../../ports/usePort';
import { DAW_SETUPS, fxChainsSource } from '../../../fixtures/daw';
import { marksDoc } from '../script/scriptFixtures';
import { AddEffect } from './AddEffect';
import { CoverageStrip } from './CoverageStrip';
import { EffectInspector } from './EffectInspector';
import { EffectHostProvider } from './EffectSettings';
import { EffectsList } from './EffectsList';
import { EffectsTab } from './EffectsTab';
import { effectHost, MANY, ONE, TOTAL } from './effectsFixtures';
import { withFxRange } from '../range/fx/fxFixtures';
import { FX_CAP_PCT } from './effectsMath';
import { OnWords } from './OnWords';

const LIST = { source: fxChainsSource('REAPER'), choices: [{ id: 'Podcast Voice.RfxChain', name: 'Podcast Voice.RfxChain' }] };

const shell = (children: React.ReactNode, width = 420) => (
  <div style={{ width }} className="flex flex-col gap-4 bg-[var(--surface)] p-3 text-[var(--text)]">
    {children}
  </div>
);

const api = { ...createMockApi(), dawCapabilities: async () => DAW_SETUPS.reaper } as ReturnType<typeof createMockApi>;

const meta = { title: 'Editing/Effects', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const list = (effects: typeof MANY, total = TOTAL, width = 420) =>
  shell(<EffectsList effects={effects} cuts={[]} total={total} selectedId={effects[0]?.id ?? null} onSelect={fn()} />, width);

export const ListNone: Story = { render: () => list([]) };
export const ListOne: Story = { render: () => list(ONE) };
export const ListMany: Story = { render: () => list(MANY) };
export const ListOverCap: Story = {
  render: () => list(MANY, 80),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('button')).toHaveLength(3);
  },
};
export const ListNarrow: Story = { render: () => list(MANY, TOTAL, 300) };

const strip = (effects: typeof MANY, total = TOTAL, width = 420, cap = FX_CAP_PCT) =>
  shell(<CoverageStrip effects={effects} cuts={[]} total={total} selectedId={effects[0]?.id ?? null} onSelect={fn()} cap={cap} onCapChange={fn()} />, width);

export const StripNone: Story = { render: () => strip([]) };
export const StripWithin: Story = { render: () => strip(ONE) };
export const StripOver: Story = { render: () => strip(MANY) };
export const StripFarOver: Story = { render: () => strip(MANY, 80) };
export const StripNarrow: Story = { render: () => strip(MANY, TOTAL, 300) };
// The narrator lowered the cap to 5%: one effect over 6% of the chapter is now over it (Editing.fx_cap_pct, SN-E106).
export const StripCapLowered: Story = { render: () => strip(ONE, TOTAL, 420, 5) };
// The cap field before the setting is read, or with no way to save it: it shows the cap and is off.
export const StripCapReadOnly: Story = {
  render: () => shell(<CoverageStrip effects={ONE} cuts={[]} total={TOTAL} selectedId={null} onSelect={fn()} capError="The settings could not be read." />),
};

export const OnWordsMany: Story = { render: () => shell(<OnWords effects={MANY} cuts={[]} onSelect={fn()} onRemove={fn()} />) };

const inspector = (dawName: string, width = 420, index = 0) =>
  shell(
    <ApiProvider api={api}>
      <EffectInspector fx={MANY[index]} cuts={[]} total={TOTAL} dawName={dawName} onRemove={fn()} position={{ index, count: MANY.length }} onStep={fn()} />
    </ApiProvider>,
    width,
  );
export const InspectorReaper: Story = {
  render: () => inspector('REAPER'),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Settings' })).toHaveProperty('disabled', true);
  },
};
// The header's Previous and Next step through the effects (the mock's `#prevf`, `#nextf`): the first has no previous, the last no next.
export const InspectorFirst: Story = {
  render: () => inspector('REAPER'),
  play: async ({ canvasElement }) => {
    const view = within(canvasElement);
    await expect(view.getByRole('button', { name: 'Previous effect' })).toHaveAttribute('aria-disabled', 'true');
    await expect(view.getByRole('button', { name: 'Next effect' })).not.toHaveAttribute('aria-disabled');
    await expect(view.getByRole('button', { name: 'Show in the DAW' })).toBeTruthy();
  },
};
export const InspectorLast: Story = {
  render: () => inspector('REAPER', 420, MANY.length - 1),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Next effect' })).toHaveAttribute('aria-disabled', 'true');
  },
};
// The DAW lists the effect's settings: a slider for the continuous one, a number field for the stepped one; Bypass, Preview and Compare work.
const withSettings = (bypassed: boolean, width = 420) => {
  const setup = withFxRange(DAW_SETUPS.reaper, 'native');
  const base = createMockDawClient(setup);
  const daw = { ...base, fxRangeParams: async (t: Parameters<typeof base.fxRangeParams>[0]) => ({ ...(await base.fxRangeParams(t)), bypassed }) };
  return (
    <ApiProvider api={{ ...createMockApi(), dawCapabilities: async () => setup }}>
      <PortOverrides clients={{ daw }}>
        <EffectHostProvider value={effectHost()}>{inspector('REAPER', width)}</EffectHostProvider>
      </PortOverrides>
    </ApiProvider>
  );
};
export const InspectorSettings: Story = {
  render: () => withSettings(false),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('textbox', { name: 'Mode' })).toBeTruthy();
    await expect(canvas.getByRole('slider', { name: 'Gain' })).toBeTruthy();
    await expect(canvas.getByRole('button', { name: 'Compare' })).toHaveProperty('disabled', false);
  },
};
export const InspectorBypassed: Story = {
  render: () => withSettings(true),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('textbox', { name: 'Mode' })).toHaveProperty('disabled', true);
    await expect(canvas.getByRole('checkbox', { name: 'Bypass this effect' }).getAttribute('aria-checked')).toBe('true');
  },
};
export const InspectorSettingsNarrow: Story = { render: () => withSettings(false, 300) };
export const InspectorRecorder: Story = { render: () => inspector('the built-in recorder') };
export const InspectorNarrow: Story = { render: () => inspector('REAPER', 300) };

const add = (over: Partial<Parameters<typeof AddEffect>[0]> = {}, width = 420) =>
  shell(
    <AddEffect hasSelection reason="" impact={{ before: 6, after: 7, over: false, far: false }} cap={FX_CAP_PCT} list={LIST} onAdd={fn()} {...over} />,
    width,
  );
export const AddNoSelection: Story = { render: () => add({ hasSelection: false, impact: null }) };
export const AddWithSelection: Story = { render: () => add() };
export const AddOverCap: Story = { render: () => add({ impact: { before: 9, after: 12, over: true, far: false } }) };
export const AddFarOverCap: Story = { render: () => add({ impact: { before: 9, after: 25, over: true, far: true } }) };
export const AddDawCannot: Story = { render: () => add({ reason: 'REAPER is not running.' }) };
const MANY_CHAINS = {
  source: LIST.source,
  choices: ['Air.RfxChain', 'Podcast Voice.RfxChain', 'Warm.RfxChain'].map((name) => ({ id: name, name })),
};
export const AddWithFavourites: Story = {
  render: () =>
    add({
      list: { source: MANY_CHAINS.source, choices: [MANY_CHAINS.choices[2], MANY_CHAINS.choices[0], MANY_CHAINS.choices[1]] },
      favourites: { names: ['Warm.RfxChain', 'Air.RfxChain'], toggle: fn(), error: '' },
    }),
};
export const AddFavouritesRefused: Story = {
  render: () => add({ list: MANY_CHAINS, favourites: { names: [], toggle: fn(), error: 'The settings file is read-only.' } }),
};

export const Tab: Story = {
  render: () => (
    <ApiProvider api={api}>
      {shell(
        <EffectsTab
          doc={marksDoc()}
          effects={MANY}
          cuts={[]}
          total={TOTAL}
          selected={[]}
          fx={{ list: LIST, ask: fn(), remove: fn(async () => {}), refusalOf: () => '' }}
          onSelectWords={fn()}
        />,
      )}
    </ApiProvider>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Effects cover 12.0% of this chapter')).toBeTruthy();
  },
};
