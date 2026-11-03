export const DAY = 86400000

export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY)
export const diffDays = (a: Date, b: Date): number => Math.round((a.getTime() - b.getTime()) / DAY)

/** "Sep 26" */
export const fmtD = (d: Date): string => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export const iso = (d: Date): string =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

export const parseIso = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Hours to "h:mm". */
export const hm = (h: number): string => {
  const m = Math.max(0, Math.round(h * 60))
  return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0')
}

export const num = (n: number): string => n.toLocaleString('en-US')

/** Seconds to "mm:ss". */
export const mmss = (s: number): string => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')

/** Seconds to "mm:ss.t", the way the recording's times are written in notes. */
export const clock = (s: number): string => {
  const t = Math.round(Math.max(0, s) * 10)
  return String(Math.floor(t / 600)).padStart(2, '0') + ':' + String(Math.floor((t % 600) / 10)).padStart(2, '0') + '.' + (t % 10)
}

/** "mm:ss" or "mm:ss.t" to seconds; null for anything else (a pickup typed with no time shows "—"). */
export const parseClock = (t: string): number | null => {
  const m = /^(\d+):(\d{2})(?:\.(\d))?$/.exec(t.trim())
  return m ? +m[1] * 60 + +m[2] + (m[3] ? +m[3] / 10 : 0) : null
}
