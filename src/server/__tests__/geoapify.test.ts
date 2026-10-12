import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_REQUESTS } from "@/contract/demo";
import { POST as placesRoute } from "@/app/api/routes/[routeId]/places/route";
import { findCity } from "../catalog";
import { remaining, resetGuestState } from "../guest";
import { nearbyPlaces, parseGeoapify } from "../providers/geoapify";
import { resetLimitedState } from "../providers/limited";
import { optimizeTrip } from "../trips";

const city = findCity("Singapore")!;
const feature = (properties: Record<string, unknown> = {}, coordinates: unknown[] = [103.82, 1.35]) => ({ type: "Feature", geometry: { type: "Point", coordinates }, properties: { place_id: "test-place", name: "Synthetic sight", categories: ["tourism.sights"], country_code: "sg", ...properties } });
const collection = (features = [feature()]) => ({ type: "FeatureCollection", features });
const reply = (body: unknown) => new Response(JSON.stringify(body));
const guestId = "g_123456789012345678901234";
const req = (body: unknown) => new Request("http://localhost/api/routes/missing/places", { method: "POST", headers: { "Content-Type": "application/json", cookie: `eh_guest=${guestId}` }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ routeId: "missing" }) };
beforeEach(() => { resetLimitedState(); resetGuestState(); vi.stubEnv("GEOAPIFY_API_KEY", "unit-test-geo-key"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Geoapify nearby places (synthetic responses only)", () => {
  it("uses one bounded centre query, never leaks the API request URL, and caches original timestamps", async () => {
    const fetcher = vi.fn(async (url: unknown) => {
      const parsed = new URL(String(url));
      expect(parsed.hostname).toBe("api.geoapify.com");
      expect(parsed.searchParams.get("limit")).toBe("5");
      expect(parsed.searchParams.get("filter")).toBe("circle:103.82,1.35,5000");
      return reply(collection([feature({ website: "https://example.org/sight?apiKey=do-not-return" })]));
    }) as typeof fetch;
    const first = await nearbyPlaces(city, fetcher);
    const second = await nearbyPlaces(city, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.spentProviderCall).toBe(true); expect(second.spentProviderCall).toBe(false);
    expect(second.response.fetchedAt).toBe(first.response.fetchedAt);
    expect(second.response.fromCache).toBe(true);
    expect(second.response.places[0].website).toBe("https://example.org/sight");
    expect(JSON.stringify(first)).not.toMatch(/unit-test-geo-key|apiKey|api.geoapify.com/);
  });

  it("rejects malformed, out-of-radius, wrong-country and unrelated places", () => {
    expect(parseGeoapify(collection([feature({}, [0, 0]), feature({ country_code: "gb" }), feature({ categories: ["catering"] }), feature({}, [null, null])]), city)).toEqual([]);
    expect(parseGeoapify({ features: {} }, city)).toBeNull();
    expect(parseGeoapify(collection([feature({ website: "https://api.geoapify.com/v2/places?apiKey=secret" })]), city)![0].website).toBeUndefined();
  });

  it("counts failed attempts and blocks at the process cap", async () => {
    vi.stubEnv("GEOAPIFY_MAX_CALLS_TOTAL", "1");
    const fetcher = vi.fn(async () => new Response("provider key secret", { status: 500 })) as typeof fetch;
    expect(await nearbyPlaces(city, fetcher)).toMatchObject({ spentProviderCall: true, response: { status: "unavailable" } });
    expect(await nearbyPlaces(city, fetcher)).toMatchObject({ spentProviderCall: false, response: { status: "quota" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("blocks without a key and never uses synthetic fallback data", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", ""); const fetcher = vi.fn();
    expect(await nearbyPlaces(city, fetcher)).toMatchObject({ spentProviderCall: false, response: { status: "not_configured", places: [] } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("prices no lines, preserves the selected route and refunds cache-only guest calls", async () => {
    const trip = optimizeTrip({ text: DEMO_REQUESTS[0].text }, "2026-10-12");
    const before = JSON.stringify(trip);
    const route = trip.options[0];
    const fetcher = vi.fn(async (url: unknown) => {
      const filter = new URL(String(url)).searchParams.get("filter");
      return reply(filter?.includes("103.82") ? collection() : collection([]));
    });
    vi.stubGlobal("fetch", fetcher);
    const routeParams = { params: Promise.resolve({ routeId: route.id }) };
    const first = await placesRoute(req({}), routeParams);
    const body = await first.json();
    expect(first.status).toBe(200); expect(body.providerCalls).toBeLessThanOrEqual(2);
    expect(body.attribution).toMatch(/Geoapify.*OpenStreetMap/);
    const spent = remaining(guestId, "nearby");
    await placesRoute(req({}), routeParams);
    expect(remaining(guestId, "nearby")).toBe(spent);
    expect(JSON.stringify(trip)).toBe(before);
  });

  it("validates fallback cities before any external call and refunds locally capped calls", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await placesRoute(req({ route: { cities: ["Unsupported"] } }), params)).status).toBe(400);
    vi.stubEnv("GEOAPIFY_MAX_CALLS_TOTAL", "0");
    const res = await placesRoute(req({ route: { cities: ["Singapore"] } }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).cities[0].status).toBe("quota");
    expect(remaining(guestId, "nearby")).toBe(10);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
