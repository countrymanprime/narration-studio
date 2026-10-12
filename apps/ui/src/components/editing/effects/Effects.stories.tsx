import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { ApiProvider } from '../../../api/ApiContext';
import { createMockApi } from '../../../api/mockApi';
import { DAW_SETUPS, fxChainsSource } from '../../../fixtures/daw';
import { marksDoc } from '../script/scriptFixtures';
import { AddEffect } from './AddEffect';
import { CoverageStrip } from './CoverageStrip';
import { EffectInspector } from './EffectInspector';
import { EffectsList } from './EffectsList';
import { EffectsTab } from './EffectsTab';
import { MANY, ONE, TOTAL } from './effectsFixtures';
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

const inspector = (dawName: string, width = 420) => shell(<EffectInspector fx={MANY[0]} cuts={[]} total={TOTAL} dawName={dawName} onRemove={fn()} />, width);
export const InspectorReaper: Story = {
  render: () => inspector('REAPER'),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Settings' })).toHaveProperty('disabled', true);
  },
};
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
