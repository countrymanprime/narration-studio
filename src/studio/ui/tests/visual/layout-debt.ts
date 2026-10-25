import type { LayoutDebt } from './lib/validators';

// Alignment rules an app state is KNOWN to break (the visual suite runs lib/layoutScan.ts, the alignment audit's DOM rules, on every
// capture: docs/research/alignment-audit.md#alignment-rules). Each entry names the state, the widths, the rule, the element (the end of
// the hit's path) and the defect as measured, so whoever fixes it can work from the entry alone. The fixes are tracked on #2251. This is
// an escape hatch, not a default: an entry hides a real defect, so the list may only shrink (`MAX_LAYOUT_DEBT_ENTRIES` in
// src/visualSuite.test.ts caps it), and an entry fails its capture when the defect stops being found, so it cannot outlive it. Every
// entry was checked against its screenshot when the list was made (2026-10-25, from a full run of main).
//
// Kept apart from the capture machinery under lib/, and reached by the capture through `layoutDebt` in app.drivers.ts.

export const LAYOUT_DEBT: LayoutDebt[] = [
  // G2: a flush table's text does not start where its card's title starts.
  {
    page: 'script',
    state: 'rail-words',
    viewports: ['wide', 'desktop'],
    rule: 'G2',
    element: 'div > table[aria-label="Words in this chapter"]',
    defect: 'desktop: table text starts at 1061, the card title at 1074; wide: table text starts at 1301, the card title at 1314',
  },
  // H1: a hit area under 24 px with another target within the 24 px circle (WCAG 2.5.8).
  {
    page: 'proof',
    state: 'chapter',
    viewports: ['desktop', 'small-desktop', 'tablet', 'reflow'],
    rule: 'H1',
    element: 'div:nth-of-type(2) > span[aria-label="Window end"]',
    defect: 'desktop, small-desktop, tablet, reflow: "Window end" is 12x34px beside another target',
  },
  {
    page: 'proof',
    state: 'chapter',
    viewports: ['desktop', 'small-desktop', 'tablet', 'reflow'],
    rule: 'H1',
    element: 'div:nth-of-type(2) > span[aria-label="Window start"]',
    defect: 'desktop, small-desktop, tablet, reflow: "Window start" is 12x34px beside another target',
  },
  {
    page: 'proof',
    state: 'check-findings',
    viewports: ['desktop', 'small-desktop', 'tablet'],
    rule: 'H1',
    element: 'div:nth-of-type(2) > span[aria-label="Window end"]',
    defect: 'desktop, small-desktop, tablet: "Window end" is 12x34px beside another target',
  },
  {
    page: 'proof',
    state: 'check-findings',
    viewports: ['desktop', 'small-desktop', 'tablet'],
    rule: 'H1',
    element: 'div:nth-of-type(2) > span[aria-label="Window start"]',
    defect: 'desktop, small-desktop, tablet: "Window start" is 12x34px beside another target',
  },
  {
    page: 'proof',
    state: 'evidence-changed',
    viewports: ['desktop', 'small-desktop', 'tablet'],
    rule: 'H1',
    element: 'div:nth-of-type(2) > span[aria-label="Window end"]',
    defect: 'desktop, small-desktop, tablet: "Window end" is 12x34px beside another target',
  },
  {
    page: 'proof',
    state: 'evidence-changed',
    viewports: ['desktop', 'small-desktop', 'tablet'],
    rule: 'H1',
    element: 'div:nth-of-type(2) > span[aria-label="Window start"]',
    defect: 'desktop, small-desktop, tablet: "Window start" is 12x34px beside another target',
  },
  {
    page: 'proof',
    state: 'hear-it',
    viewports: ['desktop', 'small-desktop', 'tablet'],
    rule: 'H1',
    element: 'div:nth-of-type(2) > span[aria-label="Window end"]',
    defect: 'desktop, small-desktop, tablet: "Window end" is 12x34px beside another target',
  },
  {
    page: 'proof',
    state: 'hear-it',
    viewports: ['desktop', 'small-desktop', 'tablet'],
    rule: 'H1',
    element: 'div:nth-of-type(2) > span[aria-label="Window start"]',
    defect: 'desktop, small-desktop, tablet: "Window start" is 12x34px beside another target',
  },
  {
    page: 'proof',
    state: 'takes-lanes',
    viewports: ['desktop', 'small-desktop', 'tablet'],
    rule: 'H1',
    element: 'div:nth-of-type(2) > span[aria-label="Window end"]',
    defect: 'desktop, small-desktop, tablet: "Window end" is 12x34px beside another target',
  },
  {
    page: 'proof',
    state: 'takes-lanes',
    viewports: ['desktop', 'small-desktop', 'tablet'],
    rule: 'H1',
    element: 'div:nth-of-type(2) > span[aria-label="Window start"]',
    defect: 'desktop, small-desktop, tablet: "Window start" is 12x34px beside another target',
  },
];
