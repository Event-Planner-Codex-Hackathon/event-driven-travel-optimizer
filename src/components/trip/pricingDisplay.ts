import type { PriceSource, TripResponse } from "@/contract/trip";

export function priceSourceLabel(source: PriceSource): string {
  if (source.retrieval === "replay") return "Recorded observation — not a current price";
  if (source.fromCache) return "Cached provider observation";
  if (source.retrieval === "live") return "Provider observation fetched for this search";
  return "Provider observation — freshness unspecified";
}

export function pricingLabel(trip: TripResponse): string {
  if (!trip.pricing || trip.pricing.mode === "estimates") return "Planning estimates";
  return trip.pricing.retrieval === "replay"
    ? "Recorded prices + estimated allowances"
    : "Provider prices + estimates";
}

/** Never allow a delayed or incompatible response to replace the displayed requirements. */
export function assertTripUpdate(previous: TripResponse, next: TripResponse): void {
  if (next.status !== "ready" || !next.normalizedRequest || !next.options.length) {
    throw new Error(next.clarificationQuestions[0] ?? "No updated itinerary was returned.");
  }
  if (next.requirementsVersion <= previous.requirementsVersion || next.previousRequestId !== previous.requestId) {
    throw new Error("An older or unrelated itinerary response was ignored. Please retry.");
  }
  const before = previous.normalizedRequest?.event;
  const after = next.normalizedRequest.event;
  if (!before || before.name !== after.name || before.city !== after.city || before.startDate !== after.startDate || before.endDate !== after.endDate) {
    throw new Error("The returned itinerary changed the fixed event and was ignored.");
  }
}

export function publicSourceUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && ![...url.searchParams.keys()].some((key) => /key|token|secret|signature/i.test(key)) ? url.href : null;
  } catch { return null; }
}
