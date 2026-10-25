// A press target at least 24 by 24 px around a control that is drawn smaller (a 22 px header chip, a 15 px info icon, a 16 px
// checkbox, a text link on a 20 px line), without changing how it looks: an invisible box centred on the control, as tall and wide as
// the control or 24 px, whichever is more (WCAG 2.2 target size; alignment audit cause G, scanner rule H1). The control becomes
// `relative`, so the box is placed on it.
export const HIT_AREA =
  'relative after:absolute after:top-1/2 after:left-1/2 after:h-full after:min-h-6 after:w-full after:min-w-6 after:-translate-x-1/2 after:-translate-y-1/2';
