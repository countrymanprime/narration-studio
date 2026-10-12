import { registerDrawerSection } from '../drawer/drawerSections';
import { EffectsTab, type EffectsTabProps } from './EffectsTab';

/** The `order` the Effects section takes in its tab. */
const EFFECTS_SECTION_ORDER = 10;

/**
 * Adds the effects section to the drawer's Effects tab. The page that mounts the drawer calls this with what the tab needs of it (the effects
 * and cuts it read, the selection and `useFxWords`) and keeps the function it returns; it calls it again when those change. Nothing calls it
 * yet: the page stays unrouted until the Editing swap (#1305).
 */
export function registerEffectsSection(props: Omit<EffectsTabProps, 'doc'>): () => void {
  return registerDrawerSection({
    tab: 'effects',
    order: EFFECTS_SECTION_ORDER,
    label: 'Effects',
    render: ({ doc }) => <EffectsTab doc={doc} {...props} />,
  });
}
