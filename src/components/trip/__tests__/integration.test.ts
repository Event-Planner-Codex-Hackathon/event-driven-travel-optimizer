import { describe, expect, it } from "vitest";
import type { EventCandidate, PriceSource, TripResponse } from "@/contract/trip";
import { optimizeTrip, reoptimizeTrip } from "@/server/trips";
import { DEMO_REQUESTS } from "@/contract/demo";
import { assertTripUpdate, priceSourceLabel, pricingLabel, publicSourceUrl } from "../pricingDisplay";
import { cityVisit, eventContext } from "../contextDisplay";
import { acceptNearbyResponse } from "../NearbySights";
import type { NearbyPlacesResponse } from "@/contract/trip";

const trip = optimizeTrip({ text: DEMO_REQUESTS[0].text }, "2026-10-12");
const source: PriceSource = { provider: "serpapi", product: "google_flights", fetchedAt: "2026-10-12T11:00:00Z", fromCache: false, description: "Synthetic test observation" };

describe("combined contract pricing display", () => {
  it("never treats replay or cached observations as fresh searches", () => {
    expect(priceSourceLabel({ ...source, retrieval: "replay", fromCache: true })).toMatch(/Recorded.*not a current/);
    expect(priceSourceLabel({ ...source, retrieval: "live", fromCache: true })).toMatch(/Cached/);
    expect(priceSourceLabel({ ...source, retrieval: "live" })).toMatch(/fetched for this search/);
    expect(priceSourceLabel(source)).toMatch(/unspecified/);
  });
  it("retains estimated allowances even with all transport and hotels provider-priced", () => {
    expect(pricingLabel({ ...trip, pricing: { ...trip.pricing, mode: "provider" } })).toBe("Provider prices + estimates");
    expect(pricingLabel({ ...trip, pricing: { ...trip.pricing, mode: "provider", retrieval: "replay" } })).toMatch(/Recorded prices.*estimated allowances/);
    expect(pricingLabel({ ...trip, pricing: undefined } as unknown as TripResponse)).toBe("Planning estimates");
  });
  it("hides non-public, credential and key-bearing source links", () => {
    for (const url of ["javascript:alert(1)", "https://secret@example.com", "https://example.com/?api_key=secret", "http://example.com", "/search"]) expect(publicSourceUrl(url)).toBeNull();
    expect(publicSourceUrl("https://example.com/search?q=Singapore")).toBe("https://example.com/search?q=Singapore");
  });
});

describe("requirements update protection", () => {
  it("accepts the backend's city replacement with its fixed event preserved", () => {
    const result = reoptimizeTrip(trip.requestId, { optionalCities: [{ city: "Taipei" }] }, trip.normalizedRequest!, null, trip.requirementsVersion);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(() => assertTripUpdate(trip, result.response)).not.toThrow();
  });
  it("rejects stale, unrelated and event-changing responses", () => {
    const next = { ...trip, previousRequestId: trip.requestId, requirementsVersion: trip.requirementsVersion + 1 };
    expect(() => assertTripUpdate(trip, { ...next, requirementsVersion: trip.requirementsVersion })).toThrow(/older/);
    expect(() => assertTripUpdate(trip, { ...next, previousRequestId: "different" })).toThrow(/unrelated/);
    expect(() => assertTripUpdate(trip, { ...next, normalizedRequest: { ...trip.normalizedRequest!, event: { ...trip.normalizedRequest!.event, endDate: "2026-10-28" } } })).toThrow(/fixed event/);
  });
});

describe("event browsing scope", () => {
  const option = trip.options[0];
  const visit = cityVisit(option, option.event.city)!;
  const event: EventCandidate = { id: "test", source: "catalog", name: "Test listing", catalogCity: option.event.city, city: option.event.city, startDate: option.event.startDate, endDate: option.event.endDate, dateConfidence: "verified", plannable: true, warnings: [] };
  it("keeps city and known date overlap explicit without adding an activity", () => {
    expect(eventContext(event, option, option.event.city)).toBe("during-visit");
    expect(eventContext({ ...event, startDate: visit.departureDate, endDate: visit.departureDate }, option, option.event.city)).toBe("outside-visit");
    expect(eventContext({ ...event, startDate: "2026-01-01", endDate: "2026-01-02" }, option, option.event.city)).toBe("outside-visit");
  });
  it("never turns partial dates or an unmapped city into an itinerary match", () => {
    expect(eventContext({ ...event, dateConfidence: "partial" }, option, option.event.city)).toBe("unconfirmed");
    expect(eventContext({ ...event, catalogCity: undefined }, option, option.event.city)).toBe("unconfirmed");
    expect(eventContext({ ...event, endDate: undefined }, option, option.event.city)).toBe("unconfirmed");
  });
  it("does not suggest the fixed event again as an optional activity", () => {
    expect(eventContext({ ...event, name: option.event.name }, option, option.event.city)).toBe("fixed-event");
  });
});

describe("selected-route sights", () => {
  it("ignores sights for a different route without displaying them", () => {
    const response: NearbyPlacesResponse = { routeId: "old-route", source: "geoapify", cities: [], providerCalls: 0, attribution: "Synthetic unit test", note: "Synthetic unit test" };
    expect(() => acceptNearbyResponse(response, "new-route")).toThrow(/different route/);
    expect(acceptNearbyResponse(response, "old-route")).toBe(response);
  });
});
