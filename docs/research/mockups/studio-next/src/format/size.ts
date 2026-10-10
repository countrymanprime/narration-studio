/** A download size for people: MB under a gigabyte, GB with one decimal above. */
export const sizeText = (mb: number): string => (mb >= 1000 ? (Math.round(mb / 100) / 10).toString().replace(/\.0$/, '') + ' GB' : Math.round(mb) + ' MB')
/** How long, in plain words. */
export const minutesText = (m: number): string => (m >= 60 ? 'about ' + Math.round(m / 60) + ' h' : 'about ' + Math.max(1, Math.round(m)) + ' min')
