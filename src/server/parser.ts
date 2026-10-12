/**
 * Deterministic natural-language request parser. Extracts origin, event,
 * dates, budget, optional cities and preferences from free text. It never
 * fabricates required fields: anything missing becomes a clarification question.
 */
import type { LodgingStyle, Pace } from "@/contract/trip";
import { CITIES, KNOWN_EVENTS, type CityInfo, type KnownEvent } from "./catalog";
import { addDays, formatShort, isValidDate } from "./dates";

export type ParsedRequest = {
  originCity?: string;
  event?: { name?: string; city?: string; startDate?: string; endDate?: string; sourceUrl?: string };
  travelWindow?: { startDate?: string; endDate?: string };
  budget?: { amountMinor: number; currency: string };
  optionalCities: string[];
  preferences: { maxStops?: number; preferredPace?: Pace; lodgingStyle?: LodgingStyle };
  /** Facts the parser inferred rather than read verbatim. */
  assumptions: string[];
  /** Problems that block planning until the user answers. */
  issues: string[];
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, ocak: 1,
  february: 2, feb: 2, şubat: 2, subat: 2,
  march: 3, mar: 3, mart: 3,
  april: 4, apr: 4, nisan: 4,
  may: 5, mayıs: 5, mayis: 5,
  june: 6, jun: 6, haziran: 6,
  july: 7, jul: 7, temmuz: 7,
  august: 8, aug: 8, ağustos: 8, agustos: 8,
  september: 9, sep: 9, sept: 9, eylül: 9, eylul: 9,
  october: 10, oct: 10, ekim: 10,
  november: 11, nov: 11, kasım: 11, kasim: 11,
  december: 12, dec: 12, aralık: 12, aralik: 12,
};

const MONTH_RE = `(${Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|")})\\.?`;
const DASH = `\\s*(?:-|–|—|to|until|through|ile)\\s*`;
const YEAR = `(?:,?\\s*(\\d{4}))?`;

function iso(year: number, month: number, day: number): string | undefined {
  const s = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidDate(s) ? s : undefined;
}

/** Pick the year: explicit, else the first year where the date is not in the past. */
function resolveYear(month: number, day: number, explicit: string | undefined, today: string): number {
  if (explicit) return Number(explicit);
  const year = Number(today.slice(0, 4));
  const candidate = iso(year, month, day);
  return candidate && candidate >= today ? year : year + 1;
}

type DateRange = { start: string; end: string; index: number; length: number };

function findDateRanges(text: string, today: string): DateRange[] {
  const ranges: DateRange[] = [];
  const patterns: Array<{ re: RegExp; read: (m: RegExpExecArray) => [number, number, number, number, string?] }> = [
    // October 27 – November 2
    { re: new RegExp(`${MONTH_RE}\\s+(\\d{1,2})${DASH}${MONTH_RE}\\s+(\\d{1,2})${YEAR}`, "giu"), read: (m) => [MONTHS[m[1].toLowerCase()], +m[2], MONTHS[m[3].toLowerCase()], +m[4], m[5]] },
    // October 27–29
    { re: new RegExp(`${MONTH_RE}\\s+(\\d{1,2})${DASH}(\\d{1,2})(?!\\d)${YEAR}`, "giu"), read: (m) => [MONTHS[m[1].toLowerCase()], +m[2], MONTHS[m[1].toLowerCase()], +m[3], m[4]] },
    // 27–29 October
    { re: new RegExp(`(\\d{1,2})${DASH}(\\d{1,2})\\s+${MONTH_RE}${YEAR}`, "giu"), read: (m) => [MONTHS[m[3].toLowerCase()], +m[1], MONTHS[m[3].toLowerCase()], +m[2], m[4]] },
    // 2026-10-27 to 2026-10-29
    { re: /(\d{4})-(\d{2})-(\d{2})\s*(?:-|–|—|to|until)\s*(\d{4})-(\d{2})-(\d{2})/giu, read: (m) => [+m[2], +m[3], +m[5], +m[6], m[1]] },
  ];
  for (const { re, read } of patterns) {
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (ranges.some((r) => m!.index < r.index + r.length && r.index < m!.index + m![0].length)) continue;
      const [m1, d1, m2, d2, y] = read(m);
      const y1 = resolveYear(m1, d1, y, today);
      const start = iso(y1, m1, d1);
      const end = iso(m2 < m1 ? y1 + 1 : y1, m2, d2);
      if (start && end && end >= start) ranges.push({ start, end, index: m.index, length: m[0].length });
    }
  }
  return ranges.sort((a, b) => a.index - b.index);
}

function findSingleDate(fragment: string, today: string): string | undefined {
  let m = new RegExp(`${MONTH_RE}\\s+(\\d{1,2})(?!\\d)${YEAR}`, "iu").exec(fragment);
  if (m) return iso(resolveYear(MONTHS[m[1].toLowerCase()], +m[2], m[3], today), MONTHS[m[1].toLowerCase()], +m[2]);
  m = new RegExp(`(\\d{1,2})\\s+${MONTH_RE}${YEAR}`, "iu").exec(fragment);
  if (m) return iso(resolveYear(MONTHS[m[2].toLowerCase()], +m[1], m[3], today), MONTHS[m[2].toLowerCase()], +m[1]);
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(fragment);
  if (m) return iso(+m[1], +m[2], +m[3]);
  return undefined;
}

type CityMention = { info: CityInfo; index: number };

function findCityMentions(text: string): CityMention[] {
  const lower = text.toLocaleLowerCase("tr");
  const mentions: CityMention[] = [];
  for (const info of CITIES) {
    let best = -1;
    for (const alias of [info.city, ...info.aliases]) {
      const a = alias.toLocaleLowerCase("tr");
      // Allow Turkish suffixes such as İstanbul'dan, Singapur'da.
      const re = new RegExp(`(^|[^\\p{L}])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}]|['’])`, "u");
      const m = re.exec(lower);
      if (m && (best === -1 || m.index < best)) best = m.index + m[1].length;
    }
    if (best >= 0) mentions.push({ info, index: best });
  }
  return mentions.sort((a, b) => a.index - b.index);
}

function findKnownEvent(text: string): KnownEvent | undefined {
  const lower = text.toLowerCase();
  return KNOWN_EVENTS.find((e) =>
    e.aliases.some((a) => new RegExp(`\\b${a.replace(/\s+/g, "\\s+")}\\b`, "i").test(lower)),
  );
}

function parseAmount(raw: string, multiplier?: string): number {
  let digits = raw.replace(/\s/g, "");
  // "70,000" / "70.000" thousands separators; "70.5k" decimal with multiplier.
  if (multiplier && /^\d+[.,]\d{1,2}$/.test(digits)) digits = digits.replace(",", ".");
  else digits = digits.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
  const value = Number(digits);
  const factor = multiplier && /^(k|bin)$/i.test(multiplier) ? 1000 : 1;
  return value * factor;
}

function findBudget(text: string, issues: string[]): ParsedRequest["budget"] {
  const num = `(\\d[\\d.,\\s]*\\d|\\d)\\s*(k|bin)?`;
  const tryRe = new RegExp(`(?:₺\\s*${num})|(?:${num}\\s*(?:try|tl|₺|lira|turkish lira)\\b)`, "iu");
  const m = tryRe.exec(text);
  if (m) {
    const amount = m[1] ? parseAmount(m[1], m[2]) : parseAmount(m[3], m[4]);
    if (Number.isFinite(amount) && amount > 0) return { amountMinor: Math.round(amount * 100), currency: "TRY" };
  }
  const foreign = new RegExp(`(?:[$€£]\\s*${num})|(?:${num}\\s*(?:usd|eur|gbp|dollars?|euros?)\\b)`, "iu").exec(text);
  if (foreign) {
    issues.push("This demo plans in Turkish lira only. What is your total budget in TRY?");
  }
  return undefined;
}

function findPreferences(text: string): ParsedRequest["preferences"] {
  const t = text.toLowerCase();
  const prefs: ParsedRequest["preferences"] = {};
  if (/\b(budget|cheap|hostel|ucuz|ekonomik)\b/.test(t) && /\b(hotel|stay|lodging|accommodation|otel|konaklama|hostel)\b/.test(t)) prefs.lodgingStyle = "budget";
  if (/\b(comfort|comfortable|luxury|nice hotel|konforlu|lüks)\b/.test(t)) prefs.lodgingStyle = "comfort";
  if (/\b(relaxed|slow|laid[- ]back|sakin|rahat)\b/.test(t)) prefs.preferredPace = "relaxed";
  if (/\b(fast|packed|quick|hızlı|yoğun)\b/.test(t)) prefs.preferredPace = "fast";
  if (/\b(direct only|no stops|nonstop only|aktarmasız)\b/.test(t)) prefs.maxStops = 0;
  return prefs;
}

export function parseRequestText(text: string, today: string): ParsedRequest {
  const issues: string[] = [];
  const assumptions: string[] = [];
  const result: ParsedRequest = { optionalCities: [], preferences: findPreferences(text), assumptions, issues };

  const mentions = findCityMentions(text);
  const known = findKnownEvent(text);
  const ranges = findDateRanges(text, today);

  // ---- Origin
  const originMatch = /(?:leaving|departing|flying|starting|coming|travel(?:l)?ing)\s+from\s+([\p{L} ]+?)(?=[,.;]|\s+(?:to|and|on|in|need|for|with)\b|$)/iu.exec(text)
    ?? /\bfrom\s+([\p{L} ]+?)(?=[,.;]|\s+(?:to|and|on|in|need|for|with)\b|$)/iu.exec(text);
  let originInfo: CityInfo | undefined;
  if (originMatch) {
    originInfo = mentions.find((c) => c.index >= originMatch.index && c.index <= originMatch.index + originMatch[0].length)?.info;
  }
  if (!originInfo) {
    // Turkish ablative: "İstanbul'dan", "Ankara'dan"
    const tr = mentions.find((c) => new RegExp(`^[\\p{L} ]+?['’]?(dan|den|tan|ten)\\b`, "iu").test(text.slice(c.index)));
    originInfo = tr?.info;
  }
  if (originInfo) result.originCity = originInfo.city;

  // ---- Event
  const event: NonNullable<ParsedRequest["event"]> = {};
  const attend = /\b(?:attend(?:ing)?|go(?:ing)? to|visit(?:ing)? the|for)\s+(?:the\s+)?([A-Z][\p{L}\d&'’ -]*?)(?=\s+(?:in|at|on|from)\b|\s+\p{Lu}\p{Ll}+\s+\d|[,.;]|\s+\d|$)/u.exec(text);
  if (known) {
    event.name = known.name;
    event.city = known.city;
    event.sourceUrl = known.sourceUrl;
  } else if (attend) {
    event.name = attend[1].trim();
  }

  // Event dates: the range closest after the event mention, else the first range.
  const eventAnchor = known
    ? text.toLowerCase().search(new RegExp(`\\b${known.aliases[0]}\\b`, "i"))
    : attend?.index ?? -1;
  const eventRange =
    (eventAnchor >= 0 ? ranges.find((r) => r.index >= eventAnchor) : undefined) ?? ranges[0];
  if (eventRange) {
    event.startDate = eventRange.start;
    event.endDate = eventRange.end;
    if (known && (eventRange.start !== known.startDate || eventRange.end !== known.endDate)) {
      assumptions.push(
        `You entered ${formatShort(eventRange.start)}–${formatShort(eventRange.end)}; the official ${known.name} site lists ${formatShort(known.startDate)}–${formatShort(known.endDate)}. Using your dates — please confirm.`,
      );
    }
  } else if (known) {
    event.startDate = known.startDate;
    event.endDate = known.endDate;
    assumptions.push(`Event dates taken from the official ${known.name} listing (${known.sourceUrl}).`);
  }

  if (!event.city) {
    // City named right after "in"/"at" following the event, else a city that is not the origin.
    const inCity = mentions.find(
      (c) => c.info.city !== originInfo?.city && /\b(in|at)\s+$/i.test(text.slice(Math.max(0, c.index - 4), c.index)),
    );
    event.city = inCity?.info.city;
  }
  result.event = event;

  // ---- Optional cities: catalog cities that are neither origin nor event city.
  result.optionalCities = mentions
    .map((c) => c.info.city)
    .filter((c) => c !== result.originCity && c !== event.city)
    .slice(0, 2);
  if (!event.city && result.optionalCities.length === 1 && !/\b(add|visit|maybe|optional|if possible)\b/i.test(text)) {
    event.city = result.optionalCities.pop();
  }

  // ---- Travel window
  const window: NonNullable<ParsedRequest["travelWindow"]> = {};
  const depart = /\b(depart(?:ing|ure)?|leav(?:e|ing)|fly(?:ing)? out)\b[^.;]*?\b(around|on|after)?\s*((?:\p{L}+\.?\s+\d{1,2})|(?:\d{1,2}\s+\p{L}+)|\d{4}-\d{2}-\d{2})/iu.exec(text);
  if (depart) {
    const d = findSingleDate(depart[3], today);
    if (d && (!eventRange || d < eventRange.start)) {
      if (depart[2]?.toLowerCase() === "around") {
        window.startDate = addDays(d, -1);
        assumptions.push(`"Around ${formatShort(d)}" interpreted as departing ${formatShort(addDays(d, -1))}–${formatShort(addDays(d, 1))}.`);
      } else {
        window.startDate = d;
      }
    }
  }
  const back = /\b(back by|return(?:ing)? by|home by|return(?:ing)?|back on)\s+(?:on\s+)?((?:\p{L}+\.?\s+\d{1,2})|(?:\d{1,2}\s+\p{L}+)|\d{4}-\d{2}-\d{2})/iu.exec(text);
  if (back) {
    const d = findSingleDate(back[2], today);
    if (d) window.endDate = d;
  }
  if (window.startDate || window.endDate) result.travelWindow = window;

  result.budget = findBudget(text, issues);
  if (originInfo) result.originCity = originInfo.city;
  return result;
}
