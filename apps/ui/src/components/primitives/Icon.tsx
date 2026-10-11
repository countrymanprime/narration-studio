import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { iconFor, type IconName } from '../../icons.catalog';

// Draws the Font Awesome definition the catalogue names for an action (`icons.catalog.ts`, ADR 0761). A screen asks for a
// meaning ("markDone"), never a glyph, so one action looks the same on every page. The icon is decoration: the control
// that holds it carries the name, so it is hidden from assistive technology, and it is fixed width so a column of them aligns.
export function Icon({ name, flip }: { name: IconName; flip?: boolean }) {
  return <FontAwesomeIcon icon={iconFor(name)} fixedWidth flip={flip ? 'horizontal' : undefined} aria-hidden="true" />;
}
