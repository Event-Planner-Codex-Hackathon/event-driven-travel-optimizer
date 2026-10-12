import type {
  EstimateSource,
  Leg,
  LodgingStyle,
  Money,
  RouteOption,
  Stay,
  TransportMode,
  TripResponse,
} from "@/contract/trip";
import { formatDay } from "@/lib/format";

// Display helpers for the trip page. Every number shown comes from the backend response.

export const SOURCE_LABEL: Record<EstimateSource, string> = {
  heuristic: "Distance-based estimate",
  mock: "Synthetic planning rate",
  provider: "Provider price observation",
};

export const STYLE_LABEL: Record<LodgingStyle, string> = {
  budget: "Budget lodging",
  standard: "Standard lodging",
  comfort: "Comfort lodging",
};

export const MODE_LABEL: Record<TransportMode, string> = {
  flight: "Flight",
  rail: "Train",
  bus: "Bus",
  ferry: "Ferry",
  unknown: "Transport",
};

/** The route shown by default: the recommended one, else the first. */
export function defaultOption(trip: TripResponse): RouteOption | undefined {
  return trip.options.find((o) => o.id === trip.recommendedOptionId) ?? trip.options[0];
}

/** ?option=<id> wins when it names a route in this response. */
export function pickFeatured(trip: TripResponse, optionParam: string | null): RouteOption | undefined {
  return (optionParam ? trip.options.find((o) => o.id === optionParam) : undefined) ?? defaultOption(trip);
}

export function cityPath(option: RouteOption): string {
  return option.citySequence.map((stop) => stop.city).join(" → ");
}

export function stopoverCities(option: RouteOption): string[] {
  return option.citySequence.filter((stop) => stop.purpose === "stopover").map((stop) => stop.city);
}

/** True when any line item in the response is a synthetic (mock) figure. */
export function hasSyntheticPrices(trip: TripResponse): boolean {
  return trip.options.some((o) => [...o.legs, ...o.stays].some((item) => item.estimateSource === "mock"));
}

export function absMoney(money: Money): Money {
  return { ...money, amountMinor: Math.abs(money.amountMinor) };
}

/** "27–29 Oct" or "30 Oct – 2 Nov" */
export function shortRange(start: string, end: string): string {
  if (start === end) return formatDay(start);
  const [sd, sm] = formatDay(start).split(" ");
  const [ed, em] = formatDay(end).split(" ");
  return sm === em ? `${sd}–${ed} ${em}` : `${formatDay(start)} – ${formatDay(end)}`;
}

export function stopsLabel(stops?: number): string | null {
  if (stops === undefined) return null;
  if (stops === 0) return "Nonstop";
  return stops === 1 ? "1 stop" : `${stops} stops`;
}

const comparedFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatCompared(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "recently" : comparedFormat.format(date);
}

export type TimelineItem = { kind: "leg"; leg: Leg; date: string } | { kind: "stay"; stay: Stay; date: string };

/** Legs and stays in travel order. A leg into a city comes before the stay that starts there. */
export function timeline(option: RouteOption): TimelineItem[] {
  const items: TimelineItem[] = [
    ...option.legs.map((leg) => ({ kind: "leg" as const, leg, date: leg.departureDate })),
    ...option.stays.map((stay) => ({ kind: "stay" as const, stay, date: stay.checkIn })),
  ];
  return items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind === b.kind) return 0;
    const leg = a.kind === "leg" ? a.leg : (b as Extract<TimelineItem, { kind: "leg" }>).leg;
    const stay = a.kind === "stay" ? a.stay : (b as Extract<TimelineItem, { kind: "stay" }>).stay;
    const legFirst = leg.toCity === stay.city;
    return a.kind === "leg" ? (legFirst ? -1 : 1) : legFirst ? 1 : -1;
  });
}
