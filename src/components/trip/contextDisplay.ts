import type { EventCandidate, RouteOption } from "@/contract/trip";

export const EVENT_SOURCE_NAMES = { catalog: "Curated catalog", google_events: "Google Events", ticketmaster: "Ticketmaster", eventbrite: "Eventbrite" } as const;
export const EVENT_STATUS_NAMES = { ok: "Available", empty: "No results", not_configured: "Not configured", quota: "Limit reached", error: "Unavailable" } as const;

export function cityVisit(option: RouteOption, city: string) {
  return option.citySequence.find((stop) => stop.purpose !== "origin" && stop.city === city);
}

/** Date/city filtering is for browsing only; candidates are never inserted into the itinerary. */
export function eventContext(candidate: EventCandidate, option: RouteOption, city: string): "during-visit" | "outside-visit" | "unconfirmed" | "fixed-event" {
  if (candidate.name === option.event.name && candidate.catalogCity === option.event.city && candidate.startDate === option.event.startDate && candidate.endDate === option.event.endDate) return "fixed-event";
  const visit = cityVisit(option, city);
  if (!visit || candidate.catalogCity !== city || !candidate.startDate || !candidate.endDate || candidate.dateConfidence === "partial") return "unconfirmed";
  // Departure day can contain travel, so don't suggest a new event starting that day.
  return candidate.startDate < visit.departureDate && candidate.endDate >= visit.arrivalDate ? "during-visit" : "outside-visit";
}
