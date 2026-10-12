/**
 * Event discovery. Results are suggestions only: the user confirms one, and
 * only then do its city and dates become the locked hard constraint (sent as
 * overrides.event to /api/trips/optimize). Nothing here ever relaxes or
 * changes an already-locked event.
 *
 * Sources:
 * - catalog: curated events with verified dates (no key);
 * - Google Events via SerpApi (shares the SerpApi hourly cap);
 * - Ticketmaster Discovery (TICKETMASTER_API_KEY);
 * - Eventbrite: import one event by link/id (EVENTBRITE_TOKEN). Eventbrite
 *   shut down keyword search in 2019, so it cannot be searched.
 */
import type { EventCandidate, EventSource, EventSourceStatus } from "@/contract/trip";
import { CITIES, KNOWN_EVENTS, findCity, type CityInfo } from "./catalog";
import { isValidDate } from "./dates";
import { MONTHS, iso, resolveYear } from "./parser";
import { takeHourlySerpApiSlot } from "./providers/runtime";
import { takeFreeSerpSearch } from "./providers/serpQuota";

const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60 * 60_000;
const MAX_RESULTS = 10;
export const eventbriteToken = () => process.env.EVENTBRITE_TOKEN || process.env.EVENTBRITE_PRIVATE_TOKEN;

type Fetcher = typeof fetch;
type Json = Record<string, unknown>;
type SourceResult = { status: EventSourceStatus; results: EventCandidate[]; metered: number };

const g = globalThis as typeof globalThis & { __eventhopperEvents?: Map<string, { expires: number; value: SourceResult }> };
const cache = (g.__eventhopperEvents ??= new Map());
const inFlight = new Map<string, Promise<SourceResult>>();
const eventState = globalThis as typeof globalThis & { __eventhopperEventCalls?: Map<string, number[]> };
const calls: Map<string, number[]> = (eventState.__eventhopperEventCalls ??= new Map());
function takeEventSlot(source: "ticketmaster" | "eventbrite"): boolean {
  const now = Date.now();
  const recent = (calls.get(source) ?? []).filter((t) => now - t < 60 * 60_000);
  const configured = process.env[`${source.toUpperCase()}_MAX_CALLS_PER_HOUR`];
  const n = configured === undefined ? 40 : Number(configured);
  const cap = Number.isSafeInteger(n) && n >= 0 ? n : 0;
  calls.set(source, recent);
  if (recent.length >= cap) return false;
  recent.push(now);
  return true;
}
const record = (v: unknown): Json | undefined => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Json : undefined;
const records = (v: unknown): Json[] => Array.isArray(v) ? v.flatMap((item) => record(item) ? [record(item)!] : []) : [];

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Find a catalog city named in any of the given texts (city names, address lines). */
export function matchCatalogCity(texts: Array<string | undefined>): CityInfo | undefined {
  const hay = texts.filter(Boolean).join(" | ").toLocaleLowerCase("tr");
  if (!hay) return undefined;
  return CITIES.find((c) =>
    [c.city, ...c.aliases].some((a) => new RegExp(`(^|[^\\p{L}])${escape(a.toLocaleLowerCase("tr"))}($|[^\\p{L}])`, "u").test(hay)),
  );
}

/** Fill plannable/warnings/overrides consistently for every source. */
export function finishCandidate(c: Omit<EventCandidate, "plannable" | "warnings" | "overrides"> & { warnings?: string[] }): EventCandidate {
  const warnings = [...(c.warnings ?? [])];
  const datesOk = !!c.startDate && !!c.endDate && isValidDate(c.startDate) && isValidDate(c.endDate) && c.endDate >= c.startDate;
  if (!c.catalogCity) warnings.push(c.city ? `${c.city} is not in our estimate catalog yet, so this trip cannot be planned.` : "No city listed for this event.");
  if (!c.startDate) warnings.push("Start date not listed; confirm the event dates before planning.");
  else if (!c.endDate) warnings.push("End date not listed; confirm the last event day before planning.");
  if (c.dateConfidence !== "verified") warnings.push("Dates as listed by the source; check the official event page before relying on them.");
  const plannable = datesOk && !!c.catalogCity;
  return {
    ...c,
    warnings,
    plannable,
    ...(plannable ? { overrides: { event: { name: c.name, city: c.catalogCity!, startDate: c.startDate!, endDate: c.endDate! } } } : {}),
  };
}

// ---------- Catalog ----------

export function searchCatalog(q: string, city?: string): EventCandidate[] {
  const needle = q.toLowerCase();
  return KNOWN_EVENTS.filter(
    (e) =>
      (e.name.toLowerCase().includes(needle) || e.aliases.some((a) => a.includes(needle) || needle.includes(a))) &&
      (!city || findCity(city)?.city === e.city),
  ).map((e) =>
    finishCandidate({
      id: `catalog:${e.name}`,
      source: "catalog",
      name: e.name,
      city: e.city,
      catalogCity: e.city,
      countryCode: findCity(e.city)?.countryCode,
      startDate: e.startDate,
      endDate: e.endDate,
      sourceUrl: e.sourceUrl,
      dateConfidence: "verified",
    }),
  );
}

// ---------- Google Events (SerpApi) ----------

const MONTH_RE = `(${Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|")})\\.?`;

/** Find "Oct 27" or "27 Oct" in a string; returns [month, day, index] or undefined. */
function findMonthDay(s: string): [number, number, number] | undefined {
  let m = new RegExp(`${MONTH_RE}\\s+(\\d{1,2})(?!\\d|:)`, "iu").exec(s);
  if (m) return [MONTHS[m[1].toLowerCase()], Number(m[2]), m.index];
  m = new RegExp(`(?<![\\d:])(\\d{1,2})\\s+${MONTH_RE}`, "iu").exec(s);
  if (m) return [MONTHS[m[2].toLowerCase()], Number(m[1]), m.index];
  return undefined;
}

/** Parse Google Events `date` ({ start_date: "Oct 27", when: "Tue, Oct 27 – Thu, Oct 29" }) into local dates. */
export function parseGoogleEventDates(date: Json | undefined, today: string): { startDate?: string; endDate?: string; partial: boolean } {
  const startText = str(date?.start_date) ?? "";
  const when = str(date?.when) ?? "";
  const start = findMonthDay(startText) ?? findMonthDay(when);
  if (!start) return { partial: true };
  const explicitYear = /\b(\d{4})\b/.exec(`${when} ${startText}`)?.[1];
  // Google commonly omits the year. Do not turn an inferred year into a hard event constraint.
  if (!explicitYear) return { partial: true };
  const year = resolveYear(start[0], start[1], explicitYear, today);
  const startDate = iso(year, start[0], start[1]);
  if (!startDate) return { partial: true };

  // Look for a second date after a range dash; a bare "– 29" means the same month.
  const dash = /\s[–—-]\s|[–—](?!\d{2}:)/.exec(when);
  if (dash) {
    const tail = when.slice(dash.index + dash[0].length);
    const end = findMonthDay(tail);
    if (end) {
      const endYear = /\b(\d{4})\b/.exec(tail)?.[1];
      const endDate = iso(endYear ? Number(endYear) : year + (end[0] < start[0] ? 1 : 0), end[0], end[1]);
      return endDate && endDate >= startDate ? { startDate, endDate, partial: false } : { startDate, partial: true };
    }
    const bare = /^\s*(?:\p{L}+,\s*)?(\d{1,2})(?!\d|:)/u.exec(tail);
    if (bare) {
      const endDate = iso(year, start[0], Number(bare[1]));
      if (endDate && endDate >= startDate) return { startDate, endDate, partial: false };
    }
    // Unreadable range end must not silently shorten a multi-day event.
    if (!/\d{1,2}:\d{2}/.test(tail)) return { startDate, partial: true };
  }
  // A single date (times only after the dash, or no dash) is a one-day event.
  return { startDate, endDate: startDate, partial: false };
}

export function parseGoogleEvents(json: Json, today: string): EventCandidate[] {
  const items = records(record(json)?.events_results);
  return items.slice(0, MAX_RESULTS).flatMap((e, i) => {
    const name = str(e.title);
    if (!name) return [];
    const address = Array.isArray(e.address) ? (e.address as unknown[]).map(str).filter((a): a is string => !!a) : [];
    const venue = str(e.venue) ?? str(record(e.venue)?.name);
    const city = matchCatalogCity([...address, venue, name]);
    const date = record(e.date) ?? { start_date: str(e.date) };
    const { startDate, endDate, partial } = parseGoogleEventDates(date, today);
    const link = str(e.link);
    return [
      finishCandidate({
        id: `google_events:${i}:${name}`,
        source: "google_events",
        name,
        city: city?.city ?? address[address.length - 1],
        catalogCity: city?.city,
        countryCode: city?.countryCode,
        venue,
        description: (str(e.description) ?? str(e.type))?.slice(0, 1200),
        dateText: [str(date.start_date), str(date.when)].filter(Boolean).join(" · ") || undefined,
        observedAt: (() => { const time = Date.parse(str(record(json.search_metadata)?.created_at) ?? ""); return Number.isFinite(time) ? new Date(time).toISOString() : undefined; })(),
        fromCache: false,
        startDate,
        endDate,
        sourceUrl: link && /^https:\/\//.test(link) ? link : undefined,
        dateConfidence: partial ? "partial" : "listed",
      }),
    ];
  });
}

async function searchGoogleEvents(q: string, city: string | undefined, apiKey: string, today: string, fetcher: Fetcher): Promise<SourceResult> {
  if (!takeHourlySerpApiSlot()) return { status: { source: "google_events", status: "quota", message: "Hourly SerpApi limit reached." }, results: [], metered: 0 };
  if (!await takeFreeSerpSearch(apiKey, fetcher)) return { status: { source: "google_events", status: "quota", message: "Free search quota could not be confirmed." }, results: [], metered: 0 };
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({ engine: "google", q: city ? `${q} ${city}` : q, hl: "en", api_key: apiKey }).toString();
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Json;
    if (res.status === 401 || res.status === 403) return { status: { source: "google_events", status: "error", message: "Event search key was rejected." }, results: [], metered: 1 };
    if (res.status === 429) return { status: { source: "google_events", status: "quota", message: "Event search quota reached." }, results: [], metered: 1 };
    if (typeof json.error === "string" && /no results|hasn't returned any results/i.test(json.error)) return { status: { source: "google_events", status: "empty" }, results: [], metered: 1 };
    if (!res.ok || json.error) return { status: { source: "google_events", status: "error", message: "Event search failed." }, results: [], metered: 1 };
    if (city) {
      const pages = parseEventPages(json, city);
      cache.set(`web|${q}|${city}`, { expires: Date.now() + CACHE_TTL_MS, value: { status: { source: "web", status: pages.length ? "ok" : "empty" }, results: pages, metered: 0 } });
    }
    const results = parseGoogleEvents(json, today);
    return { status: { source: "google_events", status: results.length ? "ok" : "empty" }, results, metered: 1 };
  } catch {
    return { status: { source: "google_events", status: "error", message: "Event search timed out or failed." }, results: [], metered: 1 };
  }
}

// ---------- Ticketmaster ----------

export function parseTicketmaster(json: Json): EventCandidate[] {
  const events = records(record(record(json)?._embedded)?.events);
  return events.slice(0, MAX_RESULTS).flatMap((e) => {
    const name = str(e.name);
    const id = str(e.id);
    if (!name || !id) return [];
    const dates = e.dates as Json | undefined;
    const startDate = str((dates?.start as Json | undefined)?.localDate);
    const endDate = str((dates?.end as Json | undefined)?.localDate);
    const venue = ((e._embedded as Json | undefined)?.venues as Json[] | undefined)?.[0];
    const venueCity = str((venue?.city as Json | undefined)?.name);
    const country = str((venue?.country as Json | undefined)?.countryCode);
    const matched = matchCatalogCity([venueCity]);
    const city = matched && (!country || matched.countryCode === country) ? matched : undefined;
    const url = str(e.url);
    return [
      finishCandidate({
        id: `ticketmaster:${id}`,
        source: "ticketmaster",
        name,
        city: venueCity,
        catalogCity: city?.city,
        countryCode: country ?? city?.countryCode,
        venue: str(venue?.name),
        description: str(e.info)?.slice(0, 1200),
        observedAt: new Date().toISOString(),
        priceNote: (() => { const range = records(e.priceRanges)[0]; const currency = str(range?.currency); const min = range?.min; const max = range?.max; return currency && typeof min === "number" && Number.isFinite(min) ? `${min}${typeof max === "number" && Number.isFinite(max) && max !== min ? `–${max}` : ""} ${currency} listed range; fees and availability need confirmation` : undefined; })(),
        startDate: startDate && isValidDate(startDate) ? startDate : undefined,
        endDate: endDate && isValidDate(endDate) ? endDate : undefined,
        sourceUrl: url && /^https:\/\//.test(url) ? url : undefined,
        dateConfidence: startDate && endDate && isValidDate(startDate) && isValidDate(endDate) ? "listed" : "partial",
      }),
    ];
  });
}

async function searchTicketmaster(q: string, city: string | undefined, apiKey: string, fetcher: Fetcher): Promise<SourceResult> {
  if (!takeEventSlot("ticketmaster")) return { status: { source: "ticketmaster", status: "quota", message: "Hourly Ticketmaster limit reached." }, results: [], metered: 0 };
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.search = new URLSearchParams({ apikey: apiKey, keyword: q, size: String(MAX_RESULTS), sort: "relevance,desc", locale: "*", ...(city ? { city } : {}) }).toString();
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (res.status === 401 || res.status === 403) return { status: { source: "ticketmaster", status: "error", message: "Ticketmaster key was rejected." }, results: [], metered: 1 };
    if (res.status === 429) return { status: { source: "ticketmaster", status: "quota", message: "Ticketmaster rate limit reached." }, results: [], metered: 1 };
    if (!res.ok) return { status: { source: "ticketmaster", status: "error", message: "Ticketmaster search failed." }, results: [], metered: 1 };
    const results = parseTicketmaster((await res.json()) as Json);
    return { status: { source: "ticketmaster", status: results.length ? "ok" : "empty" }, results, metered: 1 };
  } catch {
    return { status: { source: "ticketmaster", status: "error", message: "Ticketmaster search timed out or failed." }, results: [], metered: 1 };
  }
}

// ---------- Aggregate search ----------

export type EventSearchDeps = { serpApiKey?: string; ticketmasterKey?: string; today: string; fetcher?: Fetcher; now?: number };

async function cached(key: string, now: number, run: () => Promise<SourceResult>): Promise<SourceResult> {
  const hit = cache.get(key);
  if (hit && hit.expires > now) return { ...hit.value, results: hit.value.results.map((event: EventCandidate) => ({ ...event, fromCache: true })), metered: 0 };
  const pending = inFlight.get(key);
  if (pending) { const value = await pending; return { ...value, results: value.results.map((event) => ({ ...event, fromCache: true })), metered: 0 }; }
  const job = run().then((value) => {
    if (value.status.status === "ok" || value.status.status === "empty") cache.set(key, { expires: now + CACHE_TTL_MS, value });
    return value;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

const dedupeKey = (c: EventCandidate) => `${c.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}|${c.catalogCity ?? c.city ?? ""}|${c.startDate ?? ""}|${c.endDate ?? ""}`;

export async function searchEvents(q: string, city: string | undefined, deps: EventSearchDeps): Promise<{ results: EventCandidate[]; sources: EventSourceStatus[]; meteredCalls: number }> {
  const fetcher = deps.fetcher ?? fetch;
  const now = deps.now ?? Date.now();
  const catalog = searchCatalog(q, city);
  const notConfigured = (source: EventSource): SourceResult => ({ status: { source, status: "not_configured" }, results: [], metered: 0 });

  const [google, tm] = await Promise.all([
    deps.serpApiKey ? cached(`g|${deps.today}|${q}|${city ?? ""}`, now, () => searchGoogleEvents(q, city, deps.serpApiKey!, deps.today, fetcher)) : notConfigured("google_events"),
    deps.ticketmasterKey ? cached(`t|${q}|${city ?? ""}`, now, () => searchTicketmaster(q, city, deps.ticketmasterKey!, fetcher)) : notConfigured("ticketmaster"),
  ]);

  const seen = new Set<string>();
  const results: EventCandidate[] = [];
  // Catalog first (verified dates), then plannable provider results, then the rest.
  const providers = [...google.results, ...tm.results].sort((a, b) => Number(b.plannable) - Number(a.plannable));
  for (const c of [...catalog, ...providers]) {
    const k = dedupeKey(c);
    if (seen.has(k)) continue;
    seen.add(k);
    results.push(c);
  }
  return {
    results: results.slice(0, MAX_RESULTS),
    sources: [{ source: "catalog", status: catalog.length ? "ok" : "empty" }, google.status, tm.status],
    meteredCalls: google.metered + tm.metered,
  };
}

// Only retain a dated event-page clue when its URL and snippet agree; never promote it to a verified date.
function webDateEvidence(link: string, description?: string): string | undefined {
  const urlDate = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(link)?.[1];
  if (!urlDate || !description) return undefined;
  const parsed = parseGoogleEventDates({ when: description }, urlDate);
  return parsed.startDate === urlDate ? description : undefined;
}
function parseEventPages(data: Json, city: string): EventCandidate[] {
  const timestamp = Date.parse(str(record(data.search_metadata)?.created_at) ?? "");
  return records(data.organic_results).flatMap((item) => {
    const name = str(item.title), link = str(item.link), description = str(item.snippet);
    if (!name || !link || !/^https:\/\//.test(link)) return [];
    const matched = matchCatalogCity([name, description, link]);
    if (matched?.city !== city) return [];
    return [finishCandidate({ id: `web:${link}`, source: "web", name, description, city, catalogCity: city, sourceUrl: link, dateText: webDateEvidence(link, description), dateConfidence: "partial", observedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined, warnings: ["Public event/discovery page, not a verified dated ticket offer. Confirm individual events, dates and fees on the source page."] })];
  });
}

/** Real public discovery pages, used when a narrow Google Events query has no listings. */
export async function searchEventPages(q: string, city: string, apiKey: string, fetcher: Fetcher = fetch): Promise<SourceResult> {
  return cached(`web|${q}|${city}`, Date.now(), () => fetchEventPages(q, city, apiKey, fetcher));
}
async function fetchEventPages(q: string, city: string, apiKey: string, fetcher: Fetcher): Promise<SourceResult> {
  if (!takeHourlySerpApiSlot() || !await takeFreeSerpSearch(apiKey, fetcher)) return { status: { source: "web", status: "quota" }, results: [], metered: 0 };
  try {
    const url = new URL("https://serpapi.com/search.json");
    url.search = new URLSearchParams({ engine: "google", q: `${q} ${city}`, hl: "en", num: "8", api_key: apiKey }).toString();
    const res = await fetcher(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    const data = await res.json();
    if (!res.ok || data.error) return { status: { source: "web", status: "error" }, results: [], metered: 1 };
    const results = parseEventPages(data, city);
    return { status: { source: "web", status: results.length ? "ok" : "empty" }, results, metered: 1 };
  } catch { return { status: { source: "web", status: "error" }, results: [], metered: 1 }; }
}

// ---------- Eventbrite import ----------

/** Accepts an Eventbrite event URL (…-tickets-1234567890) or a bare numeric id. */
export function eventbriteIdFrom(input: string): string | undefined {
  const trimmed = input.trim();
  if (/^\d{6,20}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:" || u.username || u.password || !/^([a-z0-9-]+\.)?eventbrite\.(com|co\.uk|de|fr|es|it|nl|ie|pt|ca|com\.au|co\.nz)$/i.test(u.hostname) || !u.pathname.startsWith("/e/")) return undefined;
    return /(\d{6,20})(?:\/?$)/.exec(u.pathname)?.[1];
  } catch {
    return undefined;
  }
}

export function parseEventbriteEvent(json: Json): EventCandidate | undefined {
  json = record(json) ?? {};
  const id = str(json.id);
  const name = str((json.name as Json | undefined)?.text);
  if (!id || !name) return undefined;
  const startLocal = str((json.start as Json | undefined)?.local);
  const endLocal = str((json.end as Json | undefined)?.local);
  const venue = json.venue as Json | undefined;
  const address = venue?.address as Json | undefined;
  const venueCity = str(address?.city);
  const online = json.online_event === true;
  const matched = online ? undefined : matchCatalogCity([venueCity, str(address?.localized_address_display)]);
  const country = str(address?.country);
  const city = matched && (!country || matched.countryCode === country) ? matched : undefined;
  const url = str(json.url);
  const startDate = startLocal?.slice(0, 10);
  const endDate = endLocal?.slice(0, 10);
  return finishCandidate({
    id: `eventbrite:${id}`,
    source: "eventbrite",
    name,
    city: online ? undefined : venueCity,
    catalogCity: city?.city,
    countryCode: str(address?.country) ?? city?.countryCode,
    venue: str(venue?.name),
    startDate: startDate && isValidDate(startDate) ? startDate : undefined,
    endDate: endDate && isValidDate(endDate) ? endDate : undefined,
    sourceUrl: url && /^https:\/\//.test(url) ? url : undefined,
    dateConfidence: startDate && endDate ? "listed" : "partial",
    warnings: online ? ["This is an online event; there is no city to travel to."] : [],
  });
}

export type ImportResult = ({ ok: true; candidate: EventCandidate } | { ok: false; status: number; code: "invalid_body" | "provider_unavailable" | "rate_limited"; message: string }) & { spentProviderCall: boolean };

export async function importEventbrite(input: string, token: string | undefined, fetcher: Fetcher = fetch): Promise<ImportResult> {
  if (!token) return { spentProviderCall: false, ok: false, status: 503, code: "provider_unavailable", message: "Eventbrite import is not configured on this server." };
  const id = eventbriteIdFrom(input);
  if (!id) return { spentProviderCall: false, ok: false, status: 400, code: "invalid_body", message: "Paste an Eventbrite event link (…eventbrite.com/e/…-tickets-123456789) or its numeric id." };
  if (!takeEventSlot("eventbrite")) return { spentProviderCall: false, ok: false, status: 429, code: "rate_limited", message: "Hourly Eventbrite limit reached. Try again later." };
  try {
    const res = await fetcher(`https://www.eventbriteapi.com/v3/events/${id}/?expand=venue`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { spentProviderCall: true, ok: false, status: 503, code: "provider_unavailable", message: "Eventbrite rejected the server token." };
    if (res.status === 404) return { spentProviderCall: true, ok: false, status: 400, code: "invalid_body", message: "Eventbrite has no public event with that id." };
    if (res.status === 429) return { spentProviderCall: true, ok: false, status: 429, code: "rate_limited", message: "Eventbrite rate limit reached. Try again later." };
    if (!res.ok) return { spentProviderCall: true, ok: false, status: 503, code: "provider_unavailable", message: "Eventbrite request failed." };
    const candidate = parseEventbriteEvent((await res.json()) as Json);
    return candidate ? { spentProviderCall: true, ok: true, candidate } : { spentProviderCall: true, ok: false, status: 503, code: "provider_unavailable", message: "Eventbrite returned an unexpected event format." };
  } catch {
    return { spentProviderCall: true, ok: false, status: 503, code: "provider_unavailable", message: "Eventbrite request timed out or failed." };
  }
}

/** Test helper. */
export function resetEventCache(): void {
  cache.clear();
  inFlight.clear();
  calls.clear();
}
