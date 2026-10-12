import { describe, expect, it } from "vitest";
import type { TripResponse } from "@/contract/trip";
import { DEMO_REQUESTS } from "@/contract/demo";
import { compareOptions } from "../comparison";
import { checkHardConstraints } from "../constraints";
import { eachDate } from "../dates";
import { parseRequestText } from "../parser";
import { optimizeTrip, reoptimizeTrip } from "../trips";

const TODAY = "2026-10-12";
const [demoA, demoB] = DEMO_REQUESTS;

function ready(r: TripResponse) {
  expect(r.status, JSON.stringify(r.clarificationQuestions)).toBe("ready");
  return r as TripResponse & { normalizedRequest: NonNullable<TripResponse["normalizedRequest"]> };
}

describe("parser", () => {
  it("parses the repo SWITCH demo", () => {
    const p = parseRequestText(demoA.text, TODAY);
    expect(p.originCity).toBe("Istanbul");
    expect(p.event).toMatchObject({ name: "SWITCH 2026", city: "Singapore", startDate: "2026-10-27", endDate: "2026-10-29" });
    expect(p.budget).toEqual({ amountMinor: 10_000_000, currency: "TRY" });
    expect(p.optionalCities).toEqual(["Bangkok", "Taipei"]);
    expect(p.travelWindow).toEqual({ startDate: "2026-10-20", endDate: "2026-11-01" });
    expect(p.issues).toEqual([]);
  });

  it("parses the 70k demo and flags dates that differ from the official listing", () => {
    const p = parseRequestText(demoB.text, TODAY);
    expect(p.originCity).toBe("Istanbul");
    expect(p.event).toMatchObject({ city: "Singapore", startDate: "2026-10-28", endDate: "2026-10-30" });
    expect(p.budget).toEqual({ amountMinor: 7_000_000, currency: "TRY" });
    expect(p.optionalCities).toEqual(["Bangkok"]);
    expect(p.assumptions.join(" ")).toMatch(/official SWITCH 2026 site lists/);
  });

  it("handles k-suffixed and ₺ budgets", () => {
    expect(parseRequestText("from Istanbul to Singapore Oct 27-29, budget 85k TRY", TODAY).budget?.amountMinor).toBe(8_500_000);
    expect(parseRequestText("from Istanbul, ₺120.000 total", TODAY).budget?.amountMinor).toBe(12_000_000);
  });
});

describe("optimize", () => {
  for (const demo of DEMO_REQUESTS) {
    it(`returns exactly three event-locked options for: ${demo.id}`, () => {
      const r = ready(optimizeTrip({ text: demo.text }, TODAY));
      expect(r.options).toHaveLength(3);
      expect(r.options.map((o) => o.label)).toEqual(["A", "B", "C"]);
      const req = r.normalizedRequest;
      for (const o of r.options) {
        expect(o.feasibility.hardConstraintsSatisfied).toBe(true);
        expect(checkHardConstraints(req, o.citySequence, o.legs, o.stays).ok).toBe(true);
        // In the event city for the whole of every event day.
        for (const d of eachDate(req.event.startDate, req.event.endDate)) {
          expect(o.citySequence.some((s) => s.city === req.event.city && s.arrivalDate < d && s.departureDate > d)).toBe(true);
        }
        // Totals are exact integer sums.
        const c = o.costBreakdown;
        const parts = [c.transport, c.lodging, c.localTransport, c.foodAndActivities, c.contingency];
        expect(parts.every((m) => Number.isInteger(m.amountMinor) && m.currency === "TRY")).toBe(true);
        expect(parts.reduce((s, m) => s + m.amountMinor, 0)).toBe(c.total.amountMinor);
        expect(c.transport.amountMinor).toBe(o.legs.reduce((s, l) => s + l.estimatedCost.amountMinor, 0));
        expect(c.lodging.amountMinor).toBe(o.stays.reduce((s, x) => s + x.estimatedCost.amountMinor, 0));
        expect(c.remaining.amountMinor).toBe(c.budget.amountMinor - c.total.amountMinor);
        expect(o.legs.every((l) => l.estimateSource !== "provider")).toBe(true);
      }
      // Options are materially different routes.
      expect(new Set(r.options.map((o) => o.citySequence.map((s) => s.city).join(">"))).size).toBe(3);
    });
  }

  it("recommends a stopover at 100k and changes the plan when the budget drops", () => {
    const high = ready(optimizeTrip({ text: demoA.text }, TODAY));
    const top = high.options.find((o) => o.id === high.recommendedOptionId)!;
    expect(top.citySequence.some((s) => s.purpose === "stopover")).toBe(true);

    const low = reoptimizeTrip(high.requestId, { budget: { amountMinor: 6_500_000, currency: "TRY" } });
    expect(low.ok).toBe(true);
    const r = ready((low as { ok: true; response: TripResponse }).response);
    expect(r.requirementsVersion).toBe(2);
    expect(r.previousRequestId).toBe(high.requestId);
    expect(r.normalizedRequest.event).toEqual(high.normalizedRequest.event);
    const lowTop = r.options.find((o) => o.id === r.recommendedOptionId);
    // The whole itinerary is recomputed, not just the displayed total.
    const before = high.options.map((o) => `${o.title}|${o.stays.map((s) => s.style + s.nights).join(",")}`);
    const after = r.options.map((o) => `${o.title}|${o.stays.map((s) => s.style + s.nights).join(",")}`);
    expect(after).not.toEqual(before);
    if (lowTop) expect(lowTop.costBreakdown.total.amountMinor).toBeLessThanOrEqual(6_500_000);
    for (const o of r.options) expect(o.costBreakdown.budget.amountMinor).toBe(6_500_000);
  });

  it("reports over-budget honestly instead of relaxing the event", () => {
    const r = ready(optimizeTrip({ text: demoA.text, overrides: { budget: { amountMinor: 2_000_000, currency: "TRY" } } }, TODAY));
    expect(r.recommendedOptionId).toBeNull();
    for (const o of r.options) {
      expect(o.feasibility.withinBudget).toBe(false);
      expect(o.feasibility.hardConstraintsSatisfied).toBe(true);
      expect(o.feasibility.warnings.join(" ")).toMatch(/Over budget/);
    }
  });

  it("asks for missing fields instead of fabricating them", () => {
    const r = optimizeTrip({ text: "I want to go to a conference in Singapore with 50,000 TRY" }, TODAY);
    expect(r.status).toBe("needs_input");
    expect(r.options).toHaveLength(0);
    expect(r.clarificationQuestions.join(" ")).toMatch(/leaving from/);
    expect(r.clarificationQuestions.join(" ")).toMatch(/first and last days/);
  });

  it("asks to widen the window when the event cannot be protected", () => {
    const r = optimizeTrip({ text: demoA.text, overrides: { travelWindow: { endDate: "2026-10-29" } } }, TODAY);
    expect(r.status).toBe("needs_input");
    expect(r.clarificationQuestions[0]).toMatch(/widen the travel window/);
  });

  it("is deterministic for the same input", () => {
    const strip = (r: TripResponse) => r.options.map(({ id: _i, comparison, ...o }) => ({ ...o, comparison: comparison && { ...comparison, baselineOptionId: "" } }));
    expect(strip(optimizeTrip({ text: demoA.text }, TODAY))).toEqual(strip(optimizeTrip({ text: demoA.text }, TODAY)));
  });

  it("reoptimizes from baseRequest when the server forgot the request", () => {
    const first = ready(optimizeTrip({ text: demoB.text }, TODAY));
    const res = reoptimizeTrip("trp_unknown", { optionalCities: [{ city: "Taipei" }] }, first.normalizedRequest);
    expect(res.ok).toBe(true);
    const r = ready((res as { ok: true; response: TripResponse }).response);
    expect(r.normalizedRequest.optionalCities.map((c) => c.city)).toEqual(["Taipei"]);
    expect(r.options.some((o) => o.citySequence.some((s) => s.city === "Taipei"))).toBe(true);
  });
});

describe("option comparison", () => {
  it("compares every option to the recommended one with exact deltas", () => {
    const r = ready(optimizeTrip({ text: demoA.text }, TODAY));
    const base = r.options.find((o) => o.id === r.recommendedOptionId)!;
    for (const o of r.options) {
      const c = o.comparison!;
      expect(c.baselineOptionId).toBe(base.id);
      expect(c.isBaseline).toBe(o.id === base.id);
      expect(c.delta.total.amountMinor).toBe(o.costBreakdown.total.amountMinor - base.costBreakdown.total.amountMinor);
      expect(c.delta.flights).toBe(o.legs.length - base.legs.length);
      expect(c.comparablePricing).toBe(true); // all estimates
      if (o.id === base.id) expect(c.summary).toBe("");
      else expect(c.summary).toMatch(/TRY (cheaper|more)|same total/);
    }
    const direct = r.options.find((o) => o.pattern === "event-focus")!;
    if (direct.id !== base.id) expect(direct.comparison!.droppedCities.length).toBeGreaterThan(0);
  });
});


describe("fixed event during reoptimization", () => {
  it("rejects changing the locked city, dates or identity, including fallback requests", () => {
    const trip = ready(optimizeTrip({ text: demoA.text }, TODAY));
    for (const event of [{ city: "Bangkok" }, { startDate: "2026-10-28" }, { endDate: "2026-10-28" }, { name: "Different event" }]) {
      expect(reoptimizeTrip(trip.requestId, { event })).toMatchObject({ ok: false, code: "invalid_body" });
      expect(reoptimizeTrip("forgotten", { event }, trip.normalizedRequest)).toMatchObject({ ok: false, code: "invalid_body" });
    }
    const same = reoptimizeTrip(trip.requestId, { event: { city: trip.normalizedRequest.event.city } });
    expect(same.ok && same.response.normalizedRequest?.event).toEqual(trip.normalizedRequest.event);
  });
});


it("continues the client's requirements version after memory loss", () => {
  const trip = ready(optimizeTrip({ text: demoA.text }, TODAY));
  const result = reoptimizeTrip("forgotten-version", { optionalCities: [{ city: "Taipei" }] }, trip.normalizedRequest, undefined, 8);
  expect(result.ok && result.response.requirementsVersion).toBe(9);
});


it("marks live versus replay provider comparisons as indicative", () => {
  const trip = ready(optimizeTrip({ text: demoA.text }, TODAY));
  const mode = (retrieval: "live" | "replay") => ({ ...trip.options[0], id: retrieval,
    legs: trip.options[0].legs.map((l) => ({ ...l, estimateSource: "provider" as const, source: { provider: "serpapi" as const, product: "google_flights" as const, fetchedAt: "2026-10-12T09:30:00Z", fromCache: false, retrieval, description: "synthetic test" } })),
    stays: trip.options[0].stays.map((s) => ({ ...s, estimateSource: "provider" as const, source: { provider: "serpapi" as const, product: "google_hotels" as const, fetchedAt: "2026-10-12T09:30:00Z", fromCache: false, retrieval, description: "synthetic test" } })),
  });
  expect(compareOptions(mode("live"), mode("replay")).comparablePricing).toBe(false);
});
