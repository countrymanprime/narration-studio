// A press target at least 24 by 24 px around a control that is drawn smaller (a 22 px header chip, a 15 px info icon, a 16 px
// checkbox, a text link on a 20 px line), without changing how it looks: an invisible box centred on the control, as tall and wide as
// the control or 24 px, whichever is more (WCAG 2.2 target size; alignment audit cause G, scanner rule H1). The control becomes
// `relative`, so the box is placed on it.
export const HIT_AREA =
  'relative after:absolute after:top-1/2 after:left-1/2 after:h-full after:min-h-6 after:w-full after:min-w-6 after:-translate-x-1/2 after:-translate-y-1/2';

// The same box at least 32 px each way, for a control that sits beside 32 px controls in a bar (the header's chips beside Jump to; alignment
// audit XSL-3, XSL-12, R3PR2-20, R3PF-7).
export const HIT_AREA_32 = HIT_AREA.replace('after:min-h-6', 'after:min-h-8').replace('after:min-w-6', 'after:min-w-8');

// The same 24 px box for a control that is already placed (`absolute`), which is the box's containing block itself: adding `relative`
// would fight its own position (the Proof waveform's window handles, drawn 12 px wide).
export const HIT_AREA_PLACED = HIT_AREA.replace('relative ', '');
