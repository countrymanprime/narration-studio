// A stored colour is six capital hex digits with no `#` (the host checks the same shape), and '' where a colour may be unset.
const STORED_HEX = /^[0-9A-F]{6}$/;

/** What the narrator typed, as the stored form would spell it: trimmed, without a leading `#`, in capitals. It may still not be a colour. */
export function normaliseHex(text: string): string {
  return text.trim().replace(/^#/, '').toUpperCase();
}

/** Whether `hex` is a stored colour: exactly six capital hex digits. */
export function isStoredHex(hex: string): boolean {
  return STORED_HEX.test(hex);
}

// A native colour input must hold some `#rrggbb`: mid grey stands for "no colour yet", and leans toward no hue.
const UNSET_PICKER_VALUE = '#808080';

/**
 * The value a native colour input shows for a stored colour: `#rrggbb` in lower case, or mid grey for an unset or malformed one. A colour the
 * host kept in lower case (it accepts either case) is shown as itself.
 */
export function toPickerValue(hex: string): string {
  return isStoredHex(hex.toUpperCase()) ? `#${hex.toLowerCase()}` : UNSET_PICKER_VALUE;
}
