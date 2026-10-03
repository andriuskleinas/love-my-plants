const DAY_MS = 24 * 60 * 60 * 1000;

/** "today", "tomorrow", "in 3 days", "2 days overdue" — relative to local midnight. */
export function dueLabel(due: Date, now = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  return days === -1 ? "1 day overdue" : `${-days} days overdue`;
}

export function isDue(due: Date, now = new Date()): boolean {
  return due.getTime() <= now.getTime();
}
