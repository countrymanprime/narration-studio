import type { MarkColour } from '../../../../../api/contracts/marks';
import type { SwatchColour } from '../../../../primitives/Swatch';

/** The token a mark colour is drawn from: the host's six names against the app's hues (`violet` is the `org` hue, #6b4c9a). */
const SWATCH: Record<MarkColour, SwatchColour> = { copper: 'accent', info: 'info', ok: 'ok', warn: 'warn', bad: 'danger', violet: 'org' };

export const markSwatch = (colour: MarkColour): SwatchColour => SWATCH[colour];
