import { useNavigate } from 'react-router-dom';
import { addressPath } from '../../../navigation/address';
import { VoiceSamplesBody, type VoiceSamplesBodyProps } from './VoiceSamplesBody';

/** The section with its links into Editing, for a page that has the router. */
export function RoutedVoiceSamplesSection(props: Omit<VoiceSamplesBodyProps, 'openEditing'>) {
  const navigate = useNavigate();
  return <VoiceSamplesBody {...props} openEditing={(chapter) => void navigate(addressPath({ page: 'editing', ...(chapter ? { chapter } : {}) }))} />;
}
