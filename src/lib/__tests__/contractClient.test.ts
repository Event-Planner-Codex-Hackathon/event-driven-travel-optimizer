import { afterEach, describe, expect, it, vi } from "vitest";
import { getSession, getWeather, importEvent, priceCheckTrip, reoptimizeTrip, searchEvents } from "@/contract/client";
import { DEMO_REQUESTS } from "@/contract/demo";
import { optimizeTrip } from "@/server/trips";

afterEach(() => vi.unstubAllGlobals());
describe("frontend uses backend v1.2.1 wire contract", () => {
  it("sends the current requirements version and normalized request on both update endpoints", async () => {
    const trip = optimizeTrip({ text: DEMO_REQUESTS[0].text }, "2026-10-12");
    const fetcher = vi.fn(async () => new Response(JSON.stringify(trip), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    await reoptimizeTrip(trip.requestId, { optionalCities: [{ city: "Taipei" }] }, trip.normalizedRequest, undefined, 8);
    await priceCheckTrip(trip.requestId, trip.normalizedRequest, undefined, 8);
    for (const call of fetcher.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(JSON.parse(call[1].body as string)).toMatchObject({ baseRequirementsVersion: 8, baseRequest: trip.normalizedRequest });
    }
  });
  it("uses the documented session, search/import and weather endpoints without provider URLs", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    await getSession(); await searchEvents("Jazz & art", "Singapore"); await importEvent("12345678"); await getWeather("Singapore", "2026-10-27", "2026-10-29");
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe("/api/session");
    expect(calls[1][0]).toBe("/api/events/search?q=Jazz+%26+art&city=Singapore");
    expect(calls[2][0]).toBe("/api/events/import");
    expect(JSON.parse(calls[2][1].body as string)).toEqual({ url: "12345678" });
    expect(calls[3][0]).toBe("/api/weather?city=Singapore&start=2026-10-27&end=2026-10-29");
  });
});
