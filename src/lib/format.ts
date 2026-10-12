import type { Money } from "@/contract/trip";

const amount = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function formatMoney(money: Money): string {
  return `${amount.format(money.amountMinor / 100)} ${money.currency}`;
}

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** "27 Oct" */
export function formatDay(date: string): string {
  return day.format(utc(date));
}

/** "Tue 27 Oct" */
export function formatWeekday(date: string): string {
  return weekday.format(utc(date));
}

/** "27–29 October 2026" or "30 October – 2 November 2026" */
export function formatRange(start: string, end: string): string {
  const s = utc(start);
  const e = utc(end);
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${s.getUTCDate()}–${dayLong.format(e)}`;
  }
  return `${day.format(s)} – ${dayLong.format(e)}`;
}

export function formatDuration(minutes?: number): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
