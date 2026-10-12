import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_REQUESTS } from "@/contract/demo";
import { optimizeTrip } from "../trips";
import { PricingRuntime, getPricingRuntime, resetPricingState } from "../providers/runtime";
import { resetGuestState, remaining } from "../guest";
import { resetEventCache } from "../events";
import { POST as reoptimize } from "@/app/api/trips/[requestId]/reoptimize/route";
import { POST as priceCheck } from "@/app/api/trips/[requestId]/price-check/route";
import { POST as importEvent } from "@/app/api/events/import/route";

vi.mock("../providers/fx", async (importOriginal) => ({ ...await importOriginal<typeof import("../providers/fx")>(), getFxRates: vi.fn(async () => null) }));
vi.mock("../providers/runtime", async (importOriginal) => ({ ...await importOriginal<typeof import("../providers/runtime")>(), getPricingRuntime: vi.fn() }));

const guestId = "g_123456789012345678901234";
const post = (body: unknown) => new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json", cookie: `eh_guest=${guestId}` }, body: JSON.stringify(body) });
const params = (requestId: string) => ({ params: Promise.resolve({ requestId }) });

beforeEach(() => { resetGuestState(); resetPricingState(); resetEventCache(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("HTTP contract regressions (no external calls)", () => {
  it("rejects event mutations with the documented JSON error", async () => {
    const trip = optimizeTrip({ text: DEMO_REQUESTS[0].text }, "2026-10-12");
    const res = await reoptimize(post({ changes: { event: { endDate: "2026-10-28" } } }), params(trip.requestId));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "invalid_body" } });
  });

  it("increments a fallback price check exactly once from the client's version", async () => {
    const trip = optimizeTrip({ text: DEMO_REQUESTS[0].text }, "2026-10-12");
    vi.mocked(getPricingRuntime).mockReturnValue(new PricingRuntime({ name: "offline-test", async flights() { return { ok: false, reason: "error", message: "unit test" }; }, async hotels() { return { ok: false, reason: "error", message: "unit test" }; } }));
    const res = await priceCheck(post({ baseRequest: trip.normalizedRequest, baseRequirementsVersion: 8 }), params("not-in-memory"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ requirementsVersion: 9, previousRequestId: "not-in-memory", normalizedRequest: { event: trip.normalizedRequest!.event } });
  });

  it("refunds an import blocked by the process cap without calling Eventbrite", async () => {
    vi.stubEnv("EVENTBRITE_TOKEN", "unit-test-placeholder");
    vi.stubEnv("EVENTBRITE_MAX_CALLS_PER_HOUR", "0");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const res = await importEvent(post({ url: "987654321" }));
    expect(res.status).toBe(429);
    expect(fetcher).not.toHaveBeenCalled();
    expect(remaining(guestId, "eventSearch")).toBe(10);
  });
});
