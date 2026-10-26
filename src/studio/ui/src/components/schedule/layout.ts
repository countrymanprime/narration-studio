// The Schedule's two grids, shared by the page and its loading skeleton so the blocks stand where the cards arrive (alignment audit XSH-9).
// The chart takes what the 360 px side column leaves; at 1280 px and below the two stack, and from 768 px the side column's two cards
// stand side by side under the chart (XSH-2) instead of two full-width bands.
export const SCHEDULE_GRID = 'grid items-stretch gap-4 min-[1281px]:grid-cols-[minmax(0,1fr)_22.5rem]';
export const SCHEDULE_SIDE = 'grid min-w-0 content-start gap-4 md:max-[1281px]:grid-cols-2';
