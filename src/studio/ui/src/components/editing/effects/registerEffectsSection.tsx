import { registerDrawerSection } from '../drawer/drawerSections';
import { EffectHostProvider, type EffectHost } from './EffectSettings';
import { EffectsTab, type EffectsTabProps } from './EffectsTab';

/** The `order` the Effects section takes in its tab. */
const EFFECTS_SECTION_ORDER = 10;

/**
 * Adds the effects section to the drawer's Effects tab. The page that mounts the drawer calls this with what the tab needs of it (the effects
 * and cuts it read, the selection, `useFxWords` and, to change and hear an effect, the host) and keeps the function it returns; it calls it
 * again when those change.
 */
export function registerEffectsSection({ host, ...props }: Omit<EffectsTabProps, 'doc'> & { host?: EffectHost }): () => void {
  return registerDrawerSection({
    tab: 'effects',
    order: EFFECTS_SECTION_ORDER,
    label: 'Effects',
    render: ({ doc }) => (
      <EffectHostProvider value={host ?? null}>
        <EffectsTab doc={doc} {...props} />
      </EffectHostProvider>
    ),
  });
}
