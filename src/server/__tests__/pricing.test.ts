import { beforeEach, describe, expect, it } from "vitest";
import type { TripResponse } from "@/contract/trip";
import { DEMO_REQUESTS } from "@/contract/demo";
import { checkHardConstraints } from "../constraints";
import { addDays } from "../dates";
import { consume, refund, remaining, resetGuestState } from "../guest";
import { money } from "../money";
import { chooseFlight, priceCheckTrip } from "../pricing";
import { parseFlights, parseHotels } from "../providers/serpapi";
import { PricingRuntime, resetPricingState } from "../providers/runtime";
import type { FlightOffer, FlightQuery, HotelQuery, PriceProvider } from "../providers/types";
import { quotePrice } from "../quote";
import { optimizeTrip } from "../trips";

const TODAY = "2026-10-12";

/** Fake provider: fixed TRY prices; flights land on the planned day unless told otherwise. */
function fakeProvider(opts: { flightPrice?: number; hotelPerNight?: number; failHotels?: boolean; lateBy?: number } = {}) {
  const calls: string[] = [];
  const provider: PriceProvider = {
    name: "fake",
    async flights(q: FlightQuery) {
      calls.push(`f:${q.fromAirports[0]}-${q.toAirports[0]}@${q.date}`);
      const longHaul = q.fromAirports.includes("IST") || q.toAirports.includes("IST");
      const arrival = addDays(q.date, (longHaul ? 1 : 0) + (opts.lateBy ?? 0));
      return {
        ok: true,
        fetchedAt: "2026-10-12T10:00:00.000Z",
        fromCache: false,
        searchUrl: "https://www.google.com/travel/flights?test",
        offers: [
          { price: money((opts.flightPrice ?? 10_000) * 100, "TRY"), departureDate: q.date, arrivalDate: arrival, durationMinutes: 600, stops: 0, description: "Test Air TA1, nonstop" },
          { price: money(50_000 * 100, "TRY"), departureDate: q.date, arrivalDate: arrival, durationMinutes: 900, stops: 1, description: "Pricey Air PA2, 1 stop" },
        ],
      };
    },
    async hotels(q: HotelQuery) {
      calls.push(`h:${q.city}@${q.checkIn}`);
      if (opts.failHotels) return { ok: false, reason: "error", message: "Price provider returned an error." };
      const nights = Math.round((Date.parse(q.checkOut) - Date.parse(q.checkIn)) / 86_400_000);
      return {
        ok: true,
        fetchedAt: "2026-10-12T10:00:00.000Z",
        fromCache: false,
        offers: [{ name: "Test Hotel", total: money((opts.hotelPerNight ?? 1_000) * nights * 100, "TRY"), derivedFromNightly: false, hotelClass: 3 }],
      };
    },
  };
  return { provider, calls };
}

const ready = (r: TripResponse) => {
  expect(r.status).toBe("ready");
  return r;
};

beforeEach(() => {
  resetPricingState();
  resetGuestState();
});

describe("price check", () => {
  it("prices only the three options' lines, deduplicates queries, and labels provenance", async () => {
    const trip = ready(optimizeTrip({ text: DEMO_REQUESTS[0].text }, TODAY));
    const { provider, calls } = fakeProvider();
    const checked = await priceCheckTrip(trip, new PricingRuntime(provider));

    const lines = trip.options.flatMap((o) => [...o.legs.map((l) => `f${l.fromCity}${l.toCity}${l.departureDate}`), ...o.stays.map((s) => `h${s.city}${s.checkIn}${s.checkOut}${s.style}`)]);
    expect(calls.length).toBe(new Set(lines).size); // one call per unique query
    expect(calls.length).toBeLessThanOrEqual(12);
    expect(checked.requirementsVersion).toBe(trip.requirementsVersion + 1);
    expect(checked.previousRequestId).toBe(trip.requestId);
    expect(checked.options).toHaveLength(3);
    expect(["provider", "mixed"]).toContain(checked.pricing.mode);
    expect(checked.pricing.notes.join(" ")).toMatch(/never fully live/);

    for (const o of checked.options) {
      for (const l of o.legs.filter((l) => l.estimateSource === "provider")) {
        expect(l.estimatedCost.amountMinor).toBe(1_000_000); // cheapest valid fare
        expect(l.source?.product).toBe("google_flights");
        expect(l.source?.searchUrl).toMatch(/^https:\/\/www\.google\.com\//);
      }
      const c = o.costBreakdown;
      expect(c.transport.amountMinor).toBe(o.legs.reduce((s, l) => s + l.estimatedCost.amountMinor, 0));
      expect([c.transport, c.lodging, c.localTransport, c.foodAndActivities, c.contingency].reduce((s, m) => s + m.amountMinor, 0)).toBe(c.total.amountMinor);
      expect(checkHardConstraints(checked.normalizedRequest!, o.citySequence, o.legs, o.stays).ok).toBe(true);
    }
  });

  it("re-scores with provider prices: cheap live fares can bring an over-budget plan within budget", async () => {
    const trip = ready(optimizeTrip({ text: DEMO_REQUESTS[0].text, overrides: { budget: { amountMinor: 6_000_000, currency: "TRY" } } }, TODAY));
    expect(trip.recommendedOptionId).toBeNull();
    const checked = await priceCheckTrip(trip, new PricingRuntime(fakeProvider({ flightPrice: 5_000, hotelPerNight: 800 }).provider));
    expect(checked.recommendedOptionId).not.toBeNull();
    expect(checked.options[0].feasibility.withinBudget).toBe(true);
  });

  it("never accepts a fare that lands after the planned day", async () => {
    const trip = ready(optimizeTrip({ text: DEMO_REQUESTS[0].text }, TODAY));
    const checked = await priceCheckTrip(trip, new PricingRuntime(fakeProvider({ lateBy: 1 }).provider));
    for (const o of checked.options) {
      expect(o.legs.every((l) => l.estimateSource === "heuristic")).toBe(true);
      expect(o.feasibility.hardConstraintsSatisfied).toBe(true);
      expect(o.feasibility.warnings.join(" ")).toMatch(/No live fare/);
    }
  });

  it("keeps estimates visibly when the provider fails", async () => {
    const trip = ready(optimizeTrip({ text: DEMO_REQUESTS[1].text }, TODAY));
    const checked = await priceCheckTrip(trip, new PricingRuntime(fakeProvider({ failHotels: true }).provider));
    expect(checked.pricing.mode).toBe("mixed");
    expect(checked.options.every((o) => o.stays.every((s) => s.estimateSource === "mock" && !s.source))).toBe(true);
    expect(checked.pricing.notes).toContain("Price provider returned an error.");
  });

  it("counts outbound failed checks even when all lines remain estimates", async () => {
    const trip = ready(optimizeTrip({ text: DEMO_REQUESTS[1].text }, TODAY));
    const failing: PriceProvider = {
      name: "fake",
      async flights() { return { ok: false, reason: "error", message: "Fake failure." }; },
      async hotels() { return { ok: false, reason: "error", message: "Fake failure." }; },
    };
    const checked = await priceCheckTrip(trip, new PricingRuntime(failing));
    expect(checked.pricing.mode).toBe("estimates");
    expect(checked.pricing.providerCalls).toBeGreaterThan(0);
  });

  it("serves repeated checks from cache without new provider calls", async () => {
    const trip = ready(optimizeTrip({ text: DEMO_REQUESTS[1].text }, TODAY));
    const { provider, calls } = fakeProvider();
    const runtime = new PricingRuntime(provider);
    await priceCheckTrip(trip, runtime);
    const before = calls.length;
    const again = await priceCheckTrip(trip, runtime);
    expect(calls.length).toBe(before);
    expect(again.pricing.providerCalls).toBe(0);
    expect(again.pricing.cacheHits).toBeGreaterThan(0);
  });

  it("reports not-configured without calling anything", async () => {
    const r = await new PricingRuntime(null).flights({ fromAirports: ["IST"], toAirports: ["SIN"], date: "2026-10-25" }, { remaining: 5, calls: 0, cacheHits: 0 });
    expect(r).toMatchObject({ ok: false, reason: "not_configured" });
  });

  it("marks a successful in-flight shared lookup as cached for the joining request", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    const { provider } = fakeProvider();
    const slow: PriceProvider = {
      ...provider,
      async flights(q) {
        calls++;
        await gate;
        return provider.flights(q);
      },
    };
    const runtime = new PricingRuntime(slow);
    const q = { fromAirports: ["IST"], toAirports: ["SIN"], date: "2026-10-25" };
    const firstBudget = { remaining: 1, calls: 0, cacheHits: 0 };
    const secondBudget = { remaining: 1, calls: 0, cacheHits: 0 };
    const first = runtime.flights(q, firstBudget);
    const second = runtime.flights(q, secondBudget);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(calls).toBe(1);
    expect(firstBudget.calls).toBe(1);
    expect(secondBudget.calls).toBe(0);
    expect(secondBudget.cacheHits).toBe(1);
    expect(a.ok && a.fromCache).toBe(false);
    expect(b.ok && b.fromCache).toBe(true);
  });
});

describe("flight choice", () => {
  const leg = { fromCity: "Istanbul", toCity: "Singapore", departureDate: "2026-10-25", arrivalDate: "2026-10-26", mode: "flight" as const, estimatedCost: money(1, "TRY"), estimateSource: "heuristic" as const };
  const offer = (price: number, arr: string, dep = "2026-10-25"): FlightOffer => ({ price: money(price, "TRY"), departureDate: dep, arrivalDate: arr, stops: 0, description: "" });
  it("prefers landing on the planned day, then price", () => {
    expect(chooseFlight(leg, [offer(100, "2026-10-25"), offer(200, "2026-10-26")])?.price.amountMinor).toBe(200);
    expect(chooseFlight(leg, [offer(100, "2026-10-27"), offer(200, "2026-10-24", "2026-10-24")])).toBeUndefined();
  });
});

describe("SerpApi parsing", () => {
  it("parses one-way flight offers from documented fields", () => {
    const offers = parseFlights({
      best_flights: [
        {
          flights: [
            { departure_airport: { id: "IST", time: "2026-10-25 01:50" }, arrival_airport: { id: "SIN", time: "2026-10-25 17:30" }, airline: "Turkish Airlines", flight_number: "TK 54" },
          ],
          total_duration: 640,
          price: 21450,
        },
        { flights: [{ departure_airport: { id: "IST", time: "bad" }, arrival_airport: { id: "SIN", time: "2026-10-26 06:00" } }], price: 15000 },
      ],
      other_flights: [{ flights: [], price: 1000 }],
    });
    expect(offers).toEqual([
      { price: { amountMinor: 2_145_000, currency: "TRY" }, departureDate: "2026-10-25", arrivalDate: "2026-10-25", durationMinutes: 640, stops: 0, description: "Turkish Airlines TK 54, nonstop" },
    ]);
  });

  it("parses hotel totals and falls back to nightly × nights", () => {
    const offers = parseHotels({ properties: [{ name: "A", total_rate: { extracted_lowest: 9000 } }, { name: "B", rate_per_night: { extracted_lowest: 2000 } }, { name: "C" }] }, 3);
    expect(offers).toEqual([
      { name: "A", total: { amountMinor: 900_000, currency: "TRY" }, derivedFromNightly: false, hotelClass: undefined },
      { name: "B", total: { amountMinor: 600_000, currency: "TRY" }, derivedFromNightly: true, hotelClass: undefined },
    ]);
  });

  it("ignores malformed provider collections, invalid calendar dates, and overflowing prices", () => {
    expect(parseFlights({ best_flights: { flights: [] }, other_flights: [null] } as never)).toEqual([]);
    expect(parseFlights({
      best_flights: [
        { flights: [{ departure_airport: { time: "2026-02-30 09:00" }, arrival_airport: { time: "2026-03-01 11:00" } }], price: 100 },
        { flights: [{ departure_airport: { time: "2026-02-28 09:00" }, arrival_airport: { time: "2026-03-01 11:00" } }], price: 1e300 },
      ],
    })).toEqual([]);
    expect(parseHotels({ properties: [null, { name: "Overflow", total_rate: { extracted_lowest: 1e300 } }] } as never, 2)).toEqual([]);
  });
});

describe("guest limits and quotes", () => {
  it("limits per guest and supports refunds", () => {
    const reservations: string[] = [];
    for (let i = 0; i < 5; i++) {
      const use = consume("g_a", "priceCheck");
      expect(use.ok).toBe(true);
      if (use.ok) reservations.push(use.reservation);
    }
    expect(consume("g_a", "priceCheck").ok).toBe(false);
    expect(consume("g_b", "priceCheck").ok).toBe(true); // other guests unaffected
    refund("g_a", "priceCheck", reservations[0]);
    expect(remaining("g_a", "priceCheck")).toBe(1);
  });

  it("refunds the exact concurrent reservation without shortening another request's window", () => {
    const first = consume("g_a", "quote", 0);
    const second = consume("g_a", "quote", 60_000);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok) refund("g_a", "quote", first.reservation);
    expect(remaining("g_a", "quote", 3_600_001)).toBe(9);
  });

  it("quotes a flight with estimate and provider side by side", async () => {
    const r = await quotePrice({ kind: "flight", from: "istanbul", to: "Singapur", date: "2026-10-25" }, new PricingRuntime(fakeProvider().provider), TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.response.query).toEqual({ from: "Istanbul", to: "Singapore", date: "2026-10-25" });
    expect(r.response.estimate.estimateSource).toBe("heuristic");
    expect(r.response.provider.status).toBe("ok");
  });

  it("quotes estimate-only when live prices are off, and validates input", async () => {
    const off = new PricingRuntime(null);
    const r = await quotePrice({ kind: "hotel", city: "Bangkok", checkIn: "2026-10-23", checkOut: "2026-10-25", style: "standard" }, off, TODAY);
    expect(r.ok && r.response.provider.status).toBe("unavailable");
    expect(r.ok && r.response.estimate.price.amountMinor).toBe(2 * 2000 * 100);
    expect((await quotePrice({ kind: "flight", from: "Istanbul", to: "Istanbul", date: "2026-10-25" }, off, TODAY)).ok).toBe(false);
    expect((await quotePrice({ kind: "flight", from: "Istanbul", to: "Singapore", date: "2026-01-01" }, off, TODAY)).ok).toBe(false);
  });

  it("counts a failed outbound provider search against the guest allowance", async () => {
    const failing: PriceProvider = {
      name: "fake",
      async flights() { return { ok: false, reason: "quota", message: "Price provider quota reached." }; },
      async hotels() { return { ok: false, reason: "error", message: "Provider error." }; },
    };
    const result = await quotePrice({ kind: "flight", from: "Istanbul", to: "Singapore", date: "2026-10-25" }, new PricingRuntime(failing), TODAY);
    expect(result.ok && result.spentProviderCall).toBe(true);
    expect(result.ok && result.response.provider.status).toBe("unavailable");
  });
});

describe("review fixes", () => {
  it("rejects fares that land earlier than planned (unpriced extra night)", () => {
    const leg = { fromCity: "Istanbul", toCity: "Singapore", departureDate: "2026-10-25", arrivalDate: "2026-10-26", mode: "flight" as const, estimatedCost: money(1, "TRY"), estimateSource: "heuristic" as const };
    const early: FlightOffer = { price: money(100, "TRY"), departureDate: "2026-10-25", arrivalDate: "2026-10-25", stops: 0, description: "" };
    expect(chooseFlight(leg, [early])).toBeUndefined();
  });

  it("does not trust provider prices without a TRY currency echo", async () => {
    const { currencyOk } = await import("../providers/serpapi");
    expect(currencyOk({ search_parameters: { currency: "TRY" } })).toBe(true);
    expect(currencyOk({ search_parameters: {} })).toBe(false);
    expect(currencyOk({})).toBe(false);
    expect(currencyOk({ search_parameters: { currency: "USD" } })).toBe(false);
  });

  it("marks quotes served from cache as not spending a provider call", async () => {
    const runtime = new PricingRuntime(fakeProvider().provider);
    const body = { kind: "flight" as const, from: "Istanbul", to: "Bangkok", date: "2026-10-22" };
    const first = await quotePrice(body, runtime, TODAY);
    const second = await quotePrice(body, runtime, TODAY);
    expect(first.ok && first.spentProviderCall).toBe(true);
    expect(second.ok && second.spentProviderCall).toBe(false);
    expect(second.ok && second.response.provider.status === "ok" && second.response.provider.fromCache).toBe(true);
  });

  it("replaces the estimates-only assumption after a live price check", async () => {
    const trip = ready(optimizeTrip({ text: DEMO_REQUESTS[0].text }, TODAY));
    expect(trip.assumptions[0]).toMatch(/^Demo estimates/);
    const checked = await priceCheckTrip(trip, new PricingRuntime(fakeProvider().provider));
    expect(checked.assumptions.some((a) => a.startsWith("Demo estimates"))).toBe(false);
    expect(checked.assumptions[0]).toMatch(/search results/);
    expect(checked.assumptions.some((a) => a.includes("interpreted as departing"))).toBe(true); // request notes kept
  });

  it("limits by IP as well as by guest id", () => {
    const ip = "203.0.113.9";
    let allowed = 0;
    for (let i = 0; i < 20; i++) if (consume({ id: `g_${i}`, ip }, "priceCheck").ok) allowed++;
    expect(allowed).toBe(15); // 3 guests' worth per IP
  });

  it("validates baseRequest fully", async () => {
    const { normalizedRequestSchema } = await import("@/contract/trip");
    const good = ready(optimizeTrip({ text: DEMO_REQUESTS[1].text }, TODAY)).normalizedRequest!;
    expect(normalizedRequestSchema.safeParse(good).success).toBe(true);
    const { optionalCities: _o, ...missing } = good;
    expect(normalizedRequestSchema.safeParse(missing).success).toBe(false);
    expect(normalizedRequestSchema.safeParse({ ...good, event: { ...good.event, sourceUrl: "javascript:alert(1)" } }).success).toBe(false);
    expect(normalizedRequestSchema.safeParse({ ...good, budget: { amountMinor: 500_000, currency: "USD" } }).success).toBe(false);
  });

  it("does not let non-TRY override budgets crash the planner", () => {
    const result = optimizeTrip({ text: DEMO_REQUESTS[0].text, overrides: { budget: { amountMinor: 1_000_000, currency: "USD" } } as never }, TODAY);
    expect(result.status).toBe("needs_input");
    expect(result.clarificationQuestions.join(" ")).toMatch(/TRY only/);
  });

  it("computes today in Istanbul, not UTC", async () => {
    const { todayLocal } = await import("../dates");
    // 22:30 UTC on Oct 12 is already Oct 13 in Istanbul (UTC+3).
    expect(todayLocal("Europe/Istanbul", new Date("2026-10-12T22:30:00Z"))).toBe("2026-10-13");
  });
});
