import { useInRouterContext } from 'react-router-dom';
import { RoutedVoiceSamplesSection } from './RoutedVoiceSamplesSection';
import { VoiceSamplesBody, type VoiceSamplesBodyProps } from './VoiceSamplesBody';

/**
 * A list of voice samples with their play controls and ⋯ menus. Inside the router its rows link into Editing; drawn alone (a story, a unit
 * test) it has no router and draws no links.
 */
export function VoiceSamplesSection(props: Omit<VoiceSamplesBodyProps, 'openEditing'>) {
  return useInRouterContext() ? <RoutedVoiceSamplesSection {...props} /> : <VoiceSamplesBody {...props} />;
}
