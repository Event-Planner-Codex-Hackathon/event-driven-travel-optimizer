/** Date-only helpers. All values are local calendar dates as YYYY-MM-DD; arithmetic runs in UTC. */

const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

export function eachDate(start: string, endInclusive: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= endInclusive; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return new Date(toUtc(date)).toISOString().slice(0, 10) === date;
}

export function formatShort(date: string): string {
  return new Date(toUtc(date)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Today's calendar date in the product's home timezone (Istanbul), as YYYY-MM-DD. */
export function todayLocal(timeZone = "Europe/Istanbul", now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") => parts.find((p) => p.type === type)?.value;
  const [year, month, day] = [part("year"), part("month"), part("day")];
  if (!year || !month || !day) throw new Error(`Could not determine today's date in ${timeZone}.`);
  return `${year}-${month}-${day}`;
}
