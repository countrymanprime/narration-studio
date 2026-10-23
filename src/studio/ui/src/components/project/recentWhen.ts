const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayNumber = (date: Date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);

/**
 * When a recent project was last opened, as the picker's row says it (the mock's `when`): "Today", "Yesterday", else the day and
 * short month, with the year when it is not this one. Read in the narrator's local time. A stamp that is not a date gives "".
 */
export function recentWhen(lastOpened: string, now: Date): string {
  const opened = new Date(lastOpened);
  if (Number.isNaN(opened.getTime())) return '';
  const daysAgo = dayNumber(now) - dayNumber(opened);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  const text = `${opened.getDate()} ${MONTHS[opened.getMonth()]}`;
  return opened.getFullYear() === now.getFullYear() ? text : `${text} ${opened.getFullYear()}`;
}
