import { beforeEach, describe, expect, it } from "vitest";
import type { FxInfo } from "@/contract/trip";
import { DEMO_REQUESTS } from "@/contract/demo";
import { parseRequestText } from "../parser";
import { getFxRates, parseFrankfurter, resetFxState } from "../providers/fx";
import { optimizeTrip, reoptimizeTrip } from "../trips";

const TODAY = "2026-10-12";
const SAMPLE = [
  { date: "2026-10-12", base: "TRY", quote: "EUR", rate: 0.0181 },
  { date: "2026-10-12", base: "TRY", quote: "USD", rate: 0.0203 },
  { date: "2026-10-12", base: "TRY", quote: "GBP", rate: 0.0157 },
];
const FX: FxInfo = parseFrankfurter(SAMPLE)!;

beforeEach(() => resetFxState());

describe("Frankfurter", () => {
  it("parses the v2 rates array", () => {
    expect(FX).toMatchObject({ base: "TRY", date: "2026-10-12", source: "frankfurter", rates: { EUR: 0.0181, USD: 0.0203, GBP: 0.0157 } });
  });

  it("rejects incomplete or malformed responses", () => {
    expect(parseFrankfurter(SAMPLE.slice(0, 2))).toBeNull();
    expect(parseFrankfurter({ rates: {} })).toBeNull();
    expect(parseFrankfurter([{ ...SAMPLE[0], rate: -1 }, SAMPLE[1], SAMPLE[2]])).toBeNull();
  });

  it("caches rates and returns null when the service is down", async () => {
    let calls = 0;
    const ok = (async () => { calls++; return new Response(JSON.stringify(SAMPLE)); }) as unknown as typeof fetch;
    expect(await getFxRates(ok)).not.toBeNull();
    expect(await getFxRates(ok)).not.toBeNull();
    expect(calls).toBe(1);
    resetFxState();
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await getFxRates(down)).toBeNull();
  });
});

describe("foreign budgets and converted totals", () => {
  it("parses EUR/USD/GBP budgets from text", () => {
    expect(parseRequestText("from Istanbul to SWITCH Singapore Oct 27-29, budget €2,000", TODAY).budget).toEqual({ amountMinor: 200_000, currency: "EUR" });
    expect(parseRequestText("from Istanbul, 2.5k USD total", TODAY).budget).toEqual({ amountMinor: 250_000, currency: "USD" });
    expect(parseRequestText("from Istanbul, 1500 pounds", TODAY).budget).toEqual({ amountMinor: 150_000, currency: "GBP" });
  });

  it("converts a EUR budget to TRY with a dated assumption", () => {
    const text = DEMO_REQUESTS[0].text.replace("100,000 TRY", "2,000 EUR");
    const r = optimizeTrip({ text }, TODAY, FX);
    expect(r.status).toBe("ready");
    expect(r.normalizedRequest!.budget).toEqual({ amountMinor: Math.round(200_000 / 0.0181), currency: "TRY" });
    expect(r.assumptions.join(" ")).toMatch(/2,000 EUR converted to [\d,]+ TRY at 1 TRY = 0.0181 EUR \(Frankfurter reference rate, 2026-10-12\)/);
  });

  it("adds display-only converted totals and keeps TRY authoritative", () => {
    const r = optimizeTrip({ text: DEMO_REQUESTS[1].text }, TODAY, FX);
    expect(r.fx?.date).toBe("2026-10-12");
    for (const o of r.options) {
      const eur = o.convertedTotals!.find((m) => m.currency === "EUR")!;
      expect(eur.amountMinor).toBe(Math.round(o.costBreakdown.total.amountMinor * 0.0181));
      expect(o.costBreakdown.total.currency).toBe("TRY");
    }
    const re = reoptimizeTrip(r.requestId, { budget: { amountMinor: 150_000, currency: "EUR" } }, undefined, FX);
    expect(re.ok && re.response.normalizedRequest!.budget.currency).toBe("TRY");
  });

  it("asks only for supported currencies", () => {
    const r = optimizeTrip({ text: DEMO_REQUESTS[0].text, overrides: { budget: { amountMinor: 100, currency: "JPY" } } as never }, TODAY, FX);
    expect(r.status).toBe("needs_input");
  });
});


it("rejects mixed reference dates and invalid calendar dates", () => {
  expect(parseFrankfurter([SAMPLE[0], { ...SAMPLE[1], date: "2026-10-11" }, SAMPLE[2]])).toBeNull();
  expect(parseFrankfurter(SAMPLE.map((r) => ({ ...r, date: "2026-02-30" })))).toBeNull();
});


it("keeps the dated budget-conversion assumption when only the destination changes", () => {
  const trip = optimizeTrip({ text: DEMO_REQUESTS[0].text, overrides: { budget: { amountMinor: 200_000, currency: "EUR" } } }, TODAY, FX);
  const result = reoptimizeTrip(trip.requestId, { optionalCities: [{ city: "Taipei" }] }, undefined, FX);
  expect(result.ok && result.response.assumptions.some((a) => a.startsWith("Budget of ") && a.includes("2026-10-12"))).toBe(true);
});
