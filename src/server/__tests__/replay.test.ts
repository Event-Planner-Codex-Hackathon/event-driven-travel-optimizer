import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { DEMO_REQUESTS } from "@/contract/demo";
import { addDays } from "../dates";
import { money } from "../money";
import { createReplayProvider, withRecording } from "../providers/observations";
import { PricingRuntime, resetPricingState } from "../providers/runtime";
import type { FlightQuery, HotelQuery, PriceProvider } from "../providers/types";
import { priceCheckTrip } from "../pricing";
import { quotePrice } from "../quote";
import { optimizeTrip } from "../trips";

const TODAY = "2026-10-12";
const OBSERVED = "2026-10-12T09:30:00.000Z";

function liveFake(): { provider: PriceProvider; calls: () => number } {
  let calls = 0;
  const provider: PriceProvider = {
    name: "serpapi",
    async flights(q: FlightQuery) {
      calls++;
      const longHaul = q.fromAirports.includes("IST") || q.toAirports.includes("IST");
      return { ok: true, fetchedAt: OBSERVED, observedAt: OBSERVED, retrieval: "live", fromCache: false, searchUrl: "https://www.google.com/travel/flights",
        offers: [{ price: money(1_200_000, "TRY"), departureDate: q.date, arrivalDate: addDays(q.date, longHaul ? 1 : 0), durationMinutes: 600, stops: 0, description: "Test Air TA1, nonstop" }] };
    },
    async hotels(q: HotelQuery) {
      calls++;
      return { ok: true, fetchedAt: OBSERVED, observedAt: OBSERVED, retrieval: "live", fromCache: false,
        offers: [{ name: `Hotel ${q.city}`, total: money(500_000, "TRY"), derivedFromNightly: false }] };
    },
  };
  return { provider, calls: () => calls };
}

beforeEach(() => resetPricingState());

describe("record and replay", () => {
  it("records live results without secrets and replays them labeled as recorded", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "eh-obs-"));
    const trip = optimizeTrip({ text: DEMO_REQUESTS[1].text }, TODAY);
    const live = liveFake();
    await priceCheckTrip(trip, new PricingRuntime(withRecording(live.provider, dir)));
    const files = await readdir(dir);
    expect(files.length).toBe(live.calls());
    const content = (await Promise.all(files.map((f) => readFile(path.join(dir, f), "utf8")))).join("\n");
    expect(content).not.toMatch(/api_key|apikey|"key"|token/i);

    resetPricingState();
    const replayed = await priceCheckTrip(trip, new PricingRuntime(createReplayProvider(dir), Date.now, false));
    expect(replayed.pricing.retrieval).toBe("replay");
    expect(replayed.pricing.providerCalls).toBe(0); // replay is free
    expect(replayed.pricing.notes[0]).toMatch(/Recorded observations, not current prices/);
    expect(replayed.assumptions[0]).toMatch(/^Replay mode/);
    const line = replayed.options.flatMap((o) => o.legs).find((l) => l.estimateSource === "provider")!;
    expect(line.source).toMatchObject({ retrieval: "replay", observedAt: OBSERVED });
  });

  it("falls back to estimates when nothing was recorded", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "eh-obs-empty-"));
    const trip = optimizeTrip({ text: DEMO_REQUESTS[0].text }, TODAY);
    const r = await priceCheckTrip(trip, new PricingRuntime(createReplayProvider(dir), Date.now, false));
    expect(r.pricing.mode).toBe("estimates");
    expect(r.options.every((o) => o.legs.every((l) => l.estimateSource !== "provider"))).toBe(true);
  });

  it("does not count replayed quotes as spent provider calls", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "eh-obs-q-"));
    const body = { kind: "flight" as const, from: "Istanbul", to: "Singapore", date: "2026-10-25" };
    await quotePrice(body, new PricingRuntime(withRecording(liveFake().provider, dir)), TODAY);
    resetPricingState();
    const r = await quotePrice(body, new PricingRuntime(createReplayProvider(dir), Date.now, false), TODAY);
    expect(r.ok && r.spentProviderCall).toBe(false);
    expect(r.ok && r.response.provider.status === "ok" && r.response.provider.retrieval).toBe("replay");
  });
});


describe("replay integrity regressions", () => {
  const query: FlightQuery = { fromAirports: ["IST"], toAirports: ["SIN"], date: "2026-10-25" };
  const budget = () => ({ remaining: 1, calls: 0, cacheHits: 0 });
  it("isolates live and replay caches in both directions without a reset", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "eh-isolation-"));
    const live = liveFake();
    const first = await new PricingRuntime(withRecording(live.provider, dir)).flights(query, budget());
    expect(first.ok && first.retrieval).toBe("live");
    const replay = new PricingRuntime(createReplayProvider(dir), Date.now, false);
    const b = budget();
    const second = await replay.flights(query, b);
    expect(second.ok && second.retrieval).toBe("replay");
    expect(b.calls).toBe(0);
    const liveAgain = await new PricingRuntime(live.provider).flights(query, budget());
    expect(liveAgain.ok && liveAgain.retrieval).toBe("live");
  });

  it("rejects wrong currencies, mismatched queries, and malformed observation times", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "eh-invalid-"));
    await withRecording(liveFake().provider, dir).flights(query);
    const file = path.join(dir, (await readdir(dir))[0]);
    const original = JSON.parse(await readFile(file, "utf8"));
    for (const invalid of [
      { ...original, query: { ...query, toAirports: ["LHR"] } },
      { ...original, observedAt: "not-a-time" },
      { ...original, offers: [{ ...original.offers[0], price: { amountMinor: 123, currency: "USD" } }] },
      { ...original, offers: [null] },
    ]) {
      await writeFile(file, JSON.stringify(invalid));
      expect(await createReplayProvider(dir).flights(query)).toMatchObject({ ok: false, reason: "empty" });
    }
  });
});


it("isolates two replay directories even for directly constructed runtimes", async () => {
  const a = await mkdtemp(path.join(tmpdir(), "eh-dir-a-"));
  const b = await mkdtemp(path.join(tmpdir(), "eh-dir-b-"));
  const query = { fromAirports: ["IST"], toAirports: ["SIN"], date: "2026-10-25" };
  await withRecording(liveFake().provider, a).flights(query);
  const budget = () => ({ remaining: 0, calls: 0, cacheHits: 0 });
  expect((await new PricingRuntime(createReplayProvider(a), Date.now, false).flights(query, budget())).ok).toBe(true);
  expect(await new PricingRuntime(createReplayProvider(b), Date.now, false).flights(query, budget())).toMatchObject({ ok: false, reason: "empty" });
});
