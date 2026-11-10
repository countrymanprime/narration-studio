import { faCircleNotch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/** The spinner every pending control draws (`Button`, `IconButton`, `SplitMain`): one mark, still under reduced motion. */
export function PendingSpinner() {
  return <FontAwesomeIcon icon={faCircleNotch} className="motion-ok:animate-spin" aria-hidden="true" />;
}
