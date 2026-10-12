import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_REQUESTS } from "@/contract/demo";
import { POST as optimizeRoute } from "@/app/api/trips/optimize/route";
import { GET as session } from "@/app/api/session/route";
import { checkHardConstraints } from "../constraints";
import { optimizeWithInterpretation } from "../interpretation";
import { consume, remaining, resetGuestState } from "../guest";
import { aiParsingEnabled, extractionToParsed, interpretText } from "../providers/openai";
import { resetLimitedState } from "../providers/limited";
import { optimizeTrip } from "../trips";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../providers/fx", async (importOriginal) => ({ ...await importOriginal<typeof import("../providers/fx")>(), getFxRates: vi.fn(async () => null) }));

const TODAY = "2026-10-12";
const empty = () => ({
  originCity: { value: null, quote: null }, eventName: { value: null, quote: null }, eventCity: { value: null, quote: null },
  eventStartDate: { value: null, quote: null }, eventEndDate: { value: null, quote: null },
  travelStartDate: { value: null, quote: null }, travelEndDate: { value: null, quote: null }, budget: { value: null, quote: null },
  optionalCities: [], preferences: { lodgingStyle: null, preferredPace: null, maxStops: null },
});
const response = (parsed: unknown, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(parsed) }] }], usage: { input_tokens: 300, output_tokens: 200 }, ...extra }));
let budgetDir: string;
const enable = () => { vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder"); vi.stubEnv("OPENAI_SPEND_AUTHORIZED", "true"); vi.stubEnv("OPENAI_MODEL", "gpt-5.4-mini"); };
beforeEach(async () => { resetLimitedState(); resetGuestState(); vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("OPENAI_SPEND_AUTHORIZED", "false"); budgetDir = await mkdtemp(join(tmpdir(), "pookie-ai-unit-")); vi.stubEnv("OPENAI_BUDGET_FILE", join(budgetDir, "budget.json")); vi.stubEnv("OPENAI_BUDGET_USD", "5"); });
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(budgetDir, { recursive: true, force: true }); });

describe("OpenAI requirements boundary (synthetic responses only)", () => {
  it("makes no call without explicit API spending authorization", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const fetcher = vi.fn();
    expect(aiParsingEnabled()).toBe(false);
    expect(await interpretText("a trip", TODAY, fetcher)).toMatchObject({ ok: false, reason: "disabled", spentProviderCall: false });
    expect(fetcher).not.toHaveBeenCalled();
    const trip = await optimizeWithInterpretation({ text: DEMO_REQUESTS[0].text }, null, undefined, { today: TODAY, fetcher });
    expect(trip.interpretation).toMatchObject({ mode: "deterministic", status: "disabled" });
    const res = await session(new Request("http://localhost/api/session"));
    expect((await res.json()).features.aiParsing).toBe(false);
  });

  it("uses Responses structured outputs, the configured model, low reasoning and a token cap", async () => {
    enable();
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ model: "gpt-5.4-mini", store: false, service_tier: "default", reasoning: { effort: "low" }, max_output_tokens: 1800, text: { format: { type: "json_schema", strict: true } } });
      expect(body).not.toHaveProperty("tools");
      expect(String(init?.body)).not.toContain("unit-test-placeholder");
      return response(empty());
    }) as typeof fetch;
    const r = await interpretText(DEMO_REQUESTS[0].text, TODAY, fetcher);
    expect(r).toMatchObject({ ok: true, model: "gpt-5.4-mini", spentProviderCall: true, usage: { inputTokens: 300, outputTokens: 200 } });
  });

  it("rejects ungrounded fields and never lets model output change already parsed event dates/city", () => {
    const output = { ...empty(), originCity: { value: "London", quote: "invented quote" }, eventCity: { value: "Bangkok", quote: "Bangkok" }, eventEndDate: { value: "2026-10-28", quote: DEMO_REQUESTS[0].text } };
    const parsed = extractionToParsed(output, DEMO_REQUESTS[0].text, TODAY)!;
    expect(parsed.originCity).toBe("Istanbul");
    expect(parsed.event).toMatchObject({ city: "Singapore", startDate: "2026-10-27", endDate: "2026-10-29" });
    expect(extractionToParsed({ ...empty(), prices: [1] }, "a trip", TODAY)).toBeNull();
    expect(extractionToParsed({ ...empty(), budget: { value: { amountMinor: -1, currency: "TRY" }, quote: "budget" } }, "budget", TODAY)).toBeNull();
  });

  it("extracts a grounded origin the deterministic parser could not read", () => {
    const text = "Home base: Istanbul. Attend SWITCH in Singapore Oct 27–29. Budget 100,000 TRY.";
    const parsed = extractionToParsed({ ...empty(), originCity: { value: "Istanbul", quote: "Istanbul" } }, text, TODAY)!;
    expect(parsed.originCity).toBe("Istanbul");
    expect(parsed.budget?.amountMinor).toBe(10_000_000);
  });

  it("uses actual deterministic planning and lets explicit form values win over AI", async () => {
    enable();
    const input = { text: DEMO_REQUESTS[0].text, overrides: { budget: { amountMinor: 6_500_000, currency: "TRY" as const } } };
    const result = await optimizeWithInterpretation(input, null, { id: "guest", isNew: false }, { today: TODAY, fetcher: (async () => response(empty())) as typeof fetch });
    expect(result.interpretation?.mode).toBe("openai");
    expect(result.normalizedRequest!.budget.amountMinor).toBe(6_500_000);
    for (const option of result.options) expect(checkHardConstraints(result.normalizedRequest!, option.citySequence, option.legs, option.stays).ok).toBe(true);
    expect(result.options.every((o) => o.legs.every((l) => l.estimateSource === "heuristic"))).toBe(true);
  });

  it("does not use AI for a structured form", async () => {
    enable();
    const fetcher = vi.fn();
    const result = await optimizeWithInterpretation({ overrides: { budget: { amountMinor: 100, currency: "TRY" } } }, null, undefined, { today: TODAY, fetcher });
    expect(result.status).toBe("needs_input");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("shares calls and refunds a cached interpretation's guest allowance", async () => {
    enable();
    const fetcher = vi.fn(async () => response(empty())) as typeof fetch;
    const guest = { id: "guest", isNew: false };
    const a = optimizeWithInterpretation({ text: DEMO_REQUESTS[0].text }, null, guest, { today: TODAY, fetcher });
    const b = optimizeWithInterpretation({ text: DEMO_REQUESTS[0].text }, null, guest, { today: TODAY, fetcher });
    const result = await Promise.all([a, b]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.map((r) => r.interpretation?.fromCache)).toEqual([false, true]);
    expect(remaining(guest, "interpret")).toBe(4);
  });

  it("counts failed attempts, caps total calls, and never returns provider errors or secrets", async () => {
    enable(); vi.stubEnv("OPENAI_MAX_CALLS_TOTAL", "1");
    const fetcher = vi.fn(async () => new Response("secret response unit-test-placeholder", { status: 500 })) as typeof fetch;
    const guest = { id: "guest", isNew: false };
    const first = await optimizeWithInterpretation({ text: DEMO_REQUESTS[0].text }, null, guest, { today: TODAY, fetcher });
    expect(first.interpretation?.status).toBe("fallback");
    expect(JSON.stringify(first)).not.toContain("unit-test-placeholder");
    expect(remaining(guest, "interpret")).toBe(4);
    const second = await optimizeWithInterpretation({ text: DEMO_REQUESTS[1].text }, null, guest, { today: TODAY, fetcher });
    expect(second.interpretation?.note).toMatch(/local call limit/);
    expect(remaining(guest, "interpret")).toBe(4);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["incomplete", "failed"])("fails explicitly on a %s response without retrying", async (status) => {
    enable();
    const fetcher = vi.fn(async () => response(empty(), { status })) as typeof fetch;
    const r = await interpretText(DEMO_REQUESTS[0].text, TODAY, fetcher);
    expect(r).toMatchObject({ ok: false, spentProviderCall: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("stops before an outbound call when the guest allowance is exhausted", async () => {
    enable(); const guest = { id: "guest", isNew: false };
    for (let i = 0; i < 5; i++) consume(guest, "interpret");
    const fetcher = vi.fn();
    const result = await optimizeWithInterpretation({ text: DEMO_REQUESTS[0].text }, null, guest, { today: TODAY, fetcher });
    expect(result.interpretation?.status).toBe("fallback");
    expect(fetcher).not.toHaveBeenCalled();
  });
});


it("does not ground a city inside an unrelated longer word", () => {
  const parsed = extractionToParsed({ ...empty(), originCity: { value: "London", quote: "NotLondon" } }, "Home base NotLondon", TODAY)!;
  expect(parsed.originCity).toBeUndefined();
});


it("wires the existing optimize HTTP endpoint to the configured interpreter", async () => {
  enable();
  vi.stubGlobal("fetch", vi.fn(async () => response(empty())));
  const res = await optimizeRoute(new Request("http://localhost/api/trips/optimize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: DEMO_REQUESTS[0].text }) }));
  expect(res.status).toBe(200);
  const trip = await res.json();
  expect(trip).toMatchObject({ contractVersion: "1.4.0", status: "ready", interpretation: { mode: "openai", model: "gpt-5.4-mini" } });
  expect(trip.normalizedRequest.optionalCities.map((c: { city: string }) => c.city)).toEqual(["Bangkok", "Taipei"]);
});

it("reports the new session feature flags without external calls", async () => {
  enable(); vi.stubEnv("GEOAPIFY_API_KEY", "unit-test-geo-key");
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const res = await session(new Request("http://localhost/api/session"));
  expect((await res.json()).features).toMatchObject({ aiParsing: true, nearbyPlaces: true });
  expect(fetcher).not.toHaveBeenCalled();
});
