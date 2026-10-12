import type { Leg, RouteOption, Stay } from "@/contract/trip";

/*
 * Day-by-day plan for a route.
 *
 * PROPOSED contract extension (v1.1.0, not agreed yet — see
 * docs/proposals/day-plan-enrichment.md). The backend would attach an optional
 * `enrichment` object to each RouteOption with event listings and weather it
 * fetched server-side. Until it exists, the plan is built from legs, stays and
 * the fixed event dates only, and the page says which sources are not connected.
 */

export type EventSource = "eventbrite" | "ticketmaster" | "web" | "official" | "synthetic";

export type PlanEvent = {
  id: string;
  title: string;
  city: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Local times, HH:MM, when the source gives them. */
  startTime?: string | null;
  endTime?: string | null;
  venue?: string | null;
  /** Public event page returned by the source. Never constructed by the frontend. */
  url?: string | null;
  source: EventSource;
  /** ISO time the backend fetched it. */
  fetchedAt: string;
  /** "main-event" = sessions of the fixed event; "nearby" = optional things to do. */
  role: "main-event" | "nearby";
  /** Free text from the source, e.g. "Free", "From 450 TRY"; null when unknown. */
  priceNote?: string | null;
};

export type WeatherDay = {
  city: string;
  date: string;
  /** forecast = provider forecast for that date; climate = typical conditions for the season. */
  kind: "forecast" | "climate";
  condition: "clear" | "partly-cloudy" | "cloudy" | "rain" | "storm";
  summary: string;
  highC: number;
  lowC: number;
  precipChance?: number | null;
  source: string;
  fetchedAt: string;
};

export type PlanConsideration = {
  kind: "weather" | "event";
  /** Plain explanation produced by the backend from computed facts. */
  text: string;
  date?: string | null;
  city?: string | null;
};

export type SourceStatus = {
  name: string;
  status: "ok" | "unavailable" | "not-connected";
  fetchedAt?: string | null;
};

export type RouteEnrichment = {
  events: PlanEvent[];
  weather: WeatherDay[];
  considerations: PlanConsideration[];
  sources: SourceStatus[];
  /** True when the data is a synthetic preview, never real listings or forecasts. */
  synthetic?: boolean;
};

/** Reads the proposed optional field without changing the shared contract types. */
export function enrichmentOf(option: RouteOption): RouteEnrichment | null {
  const value = (option as RouteOption & { enrichment?: Partial<RouteEnrichment> | null }).enrichment;
  if (!value) return null;
  const valid =
    Array.isArray(value.events) &&
    Array.isArray(value.weather) &&
    Array.isArray(value.considerations) &&
    Array.isArray(value.sources);
  if (valid) return value as RouteEnrichment;
  // Malformed data is shown as unavailable rather than crashing the page or reading as "not connected".
  return {
    events: [],
    weather: [],
    considerations: [],
    sources: PLANNED_SOURCES.map((name) => ({ name, status: "unavailable" as const })),
  };
}

export const PLANNED_SOURCES = ["Eventbrite", "Ticketmaster", "Web search", "Weather"] as const;

// ---------- Day builder ----------

export type DayActivity =
  | { kind: "depart"; leg: Leg }
  | { kind: "arrive"; leg: Leg }
  | { kind: "check-in"; stay: Stay }
  | { kind: "check-out"; stay: Stay }
  | { kind: "event"; event: PlanEvent };

export type PlanDay = {
  date: string;
  /** Where the traveler wakes up / spends the day; null while airborne overnight. */
  city: string | null;
  isEventDay: boolean;
  isStopDay: boolean;
  activities: DayActivity[];
  weather: WeatherDay | null;
  considerations: PlanConsideration[];
  nearby: PlanEvent[];
};

const DAY_MS = 86_400_000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);

function cityOn(date: string, option: RouteOption): string | null {
  // A stay covers check-in up to (not including) check-out; departure days belong to the city left.
  const stay = option.stays.find((s) => s.checkIn <= date && date < s.checkOut);
  if (stay) return stay.city;
  const leaving = option.legs.find((l) => l.departureDate === date);
  if (leaving) return leaving.fromCity;
  const arriving = option.legs.find((l) => l.arrivalDate === date);
  return arriving ? arriving.toCity : null;
}

export function buildDays(option: RouteOption, enrichment: RouteEnrichment | null): PlanDay[] {
  if (!option.legs.length) return [];
  const first = option.legs[0].departureDate;
  const last = option.legs[option.legs.length - 1].arrivalDate;
  const stopCities = new Set(option.citySequence.filter((s) => s.purpose === "stopover").map((s) => s.city));
  const { startDate, endDate } = option.event;

  const days: PlanDay[] = [];
  for (let t = toTime(first); t <= toTime(last); t += DAY_MS) {
    const date = toDate(t);
    const city = cityOn(date, option);
    const activities: DayActivity[] = [];

    for (const leg of option.legs) {
      if (leg.departureDate === date) activities.push({ kind: "depart", leg });
      if (leg.arrivalDate === date) activities.push({ kind: "arrive", leg });
    }
    for (const stay of option.stays) {
      if (stay.checkIn === date) activities.push({ kind: "check-in", stay });
      if (stay.checkOut === date) activities.push({ kind: "check-out", stay });
    }

    const dayEvents = (enrichment?.events ?? []).filter((e) => e.date === date);
    for (const event of dayEvents.filter((e) => e.role === "main-event")) activities.push({ kind: "event", event });

    days.push({
      date,
      city,
      isEventDay: date >= startDate && date <= endDate,
      isStopDay: city !== null && stopCities.has(city),
      activities,
      weather: (enrichment?.weather ?? []).find((w) => w.date === date && w.city === city) ?? null,
      considerations: (enrichment?.considerations ?? []).filter((c) => c.date === date),
      nearby: city ? dayEvents.filter((e) => e.role === "nearby" && e.city === city) : [],
    });
  }
  return days;
}

/** Route-level considerations without a specific date (e.g. "weather checked for every city"). */
export function generalConsiderations(enrichment: RouteEnrichment | null): PlanConsideration[] {
  return (enrichment?.considerations ?? []).filter((c) => !c.date);
}

// ---------- Synthetic preview (explicit ?preview=synthetic only) ----------

const CONDITIONS: WeatherDay["condition"][] = ["partly-cloudy", "rain", "clear", "cloudy", "storm"];

/** Deterministic, clearly synthetic sample data so the layout can be reviewed before the backend sends real data. */
export function syntheticEnrichment(option: RouteOption): RouteEnrichment {
  const now = new Date().toISOString();
  const days = buildDays(option, null);
  const { startDate, endDate, city: eventCity, name } = option.event;

  const events: PlanEvent[] = [];
  for (const day of days) {
    if (day.date >= startDate && day.date <= endDate) {
      events.push({
        id: `syn-main-${day.date}`,
        title: `${name} · sample session block`,
        city: eventCity,
        date: day.date,
        startTime: "09:00",
        endTime: "18:00",
        venue: "Sample venue",
        url: null,
        source: "synthetic",
        fetchedAt: now,
        role: "main-event",
        priceNote: null,
      });
    } else if (day.city && day.activities.length <= 1) {
      events.push({
        id: `syn-near-${day.date}`,
        title: "Sample evening listing",
        city: day.city,
        date: day.date,
        startTime: "19:30",
        endTime: null,
        venue: "Sample venue",
        url: null,
        source: "synthetic",
        fetchedAt: now,
        role: "nearby",
        priceNote: null,
      });
    }
  }

  const weather: WeatherDay[] = days
    .filter((d) => d.city)
    .map((d, i) => {
      const condition = CONDITIONS[i % CONDITIONS.length];
      return {
        city: d.city as string,
        date: d.date,
        kind: "climate",
        condition,
        summary: `Sample ${condition.replace("-", " ")} conditions`,
        highC: 31 - (i % 3),
        lowC: 25 - (i % 2),
        precipChance: condition === "rain" || condition === "storm" ? 70 : 20,
        source: "Synthetic sample",
        fetchedAt: now,
      };
    });

  const rainy = weather.find((w) => w.condition === "rain" || w.condition === "storm");
  const considerations: PlanConsideration[] = [
    { kind: "weather", text: "Sample note: weather was checked for every city and day on this route." },
  ];
  if (rainy) {
    considerations.push({
      kind: "weather",
      text: `Sample note: rain is likely in ${rainy.city}, so the free time that day is kept indoors.`,
      date: rainy.date,
      city: rainy.city,
    });
  }

  return {
    events,
    weather,
    considerations,
    sources: PLANNED_SOURCES.map((sourceName) => ({ name: sourceName, status: "not-connected" as const })),
    synthetic: true,
  };
}
