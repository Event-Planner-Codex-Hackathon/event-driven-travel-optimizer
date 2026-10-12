/**
 * Quota-safe access to the live price provider:
 * - 15-minute cache keyed by the exact query (budget-only changes cost nothing);
 * - identical concurrent queries share one call;
 * - a per-operation call budget and a rolling hourly ceiling for the process
 *   (free plan: stay under the provider's hourly limit, never pay overage).
 */
import type { ProviderFailure } from "@/contract/trip";
import { createReplayProvider, observationsDir, withRecording } from "./observations";
import { createSerpApiProvider } from "./serpapi";
import type { FlightOffer, FlightQuery, HotelOffer, HotelQuery, PriceProvider, ProviderResult } from "./types";
import { takeFreeSerpSearch } from "./serpQuota";

const CACHE_TTL_MS = 15 * 60_000;
const HOUR_MS = 60 * 60_000;

export type CallBudget = { remaining: number; calls: number; cacheHits: number };
export const createBudget = (max: number): CallBudget => ({ remaining: max, calls: 0, cacheHits: 0 });

type CacheEntry = { expires: number; result: ProviderResult<FlightOffer> | ProviderResult<HotelOffer> };
type State = { cache: Map<string, CacheEntry>; inFlight: Map<string, Promise<unknown>>; callTimes: number[] };

const g = globalThis as typeof globalThis & { __eventhopperPricing?: State };
const state: State = (g.__eventhopperPricing ??= { cache: new Map(), inFlight: new Map(), callTimes: [] });

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export const maxCallsPerCheck = () => envInt("SERPAPI_MAX_CALLS_PER_CHECK", 12);
const maxCallsPerHour = () => envInt("SERPAPI_MAX_CALLS_PER_HOUR", 40);

export class PricingRuntime {
  constructor(
    private readonly provider: PriceProvider | null,
    private readonly now: () => number = Date.now,
    /** Unmetered providers (replay) cost nothing: no call budget, no hourly cap, not counted as calls. */
    private readonly metered = true,
    private readonly cacheScope = provider?.cacheScope ?? `${provider?.name ?? "off"}|${metered ? "metered" : "replay"}`,
  ) {}

  get available(): boolean {
    return this.provider !== null;
  }

  flights(q: FlightQuery, budget: CallBudget): Promise<ProviderResult<FlightOffer>> {
    return this.run(`f|${q.fromAirports.join(",")}|${q.toAirports.join(",")}|${q.date}`, budget, (p) => p.flights(q));
  }

  hotels(q: HotelQuery, budget: CallBudget): Promise<ProviderResult<HotelOffer>> {
    return this.run(`h|${q.city}|${q.checkIn}|${q.checkOut}|${q.style}`, budget, (p) => p.hotels(q));
  }

  private fail<T>(reason: ProviderFailure, message: string): ProviderResult<T> {
    return { ok: false, reason, message };
  }

  private async run<T>(key: string, budget: CallBudget, fn: (p: PriceProvider) => Promise<ProviderResult<T>>): Promise<ProviderResult<T>> {
    if (!this.provider) return this.fail("not_configured", "Live prices are not configured on this server.");
    key = `${this.cacheScope}|${key}`;
    const now = this.now();

    const hit = state.cache.get(key);
    if (hit && hit.expires > now) {
      budget.cacheHits++;
      const r = hit.result as ProviderResult<T>;
      return r.ok ? { ...r, fromCache: true } : r;
    }

    const pending = state.inFlight.get(key) as Promise<ProviderResult<T>> | undefined;
    if (pending) {
      budget.cacheHits++;
      const r = await pending;
      return r.ok ? { ...r, fromCache: true } : r;
    }

    if (this.metered) {
      if (budget.remaining <= 0) return this.fail("quota", "Live price lookups for this request reached their limit.");
      state.callTimes = state.callTimes.filter((t) => now - t < HOUR_MS);
      if (state.callTimes.length >= maxCallsPerHour()) return this.fail("quota", "Hourly live price limit reached. Try again later.");
      if (this.provider.name === "serpapi" && !await takeFreeSerpSearch(process.env.SERPAPI_API_KEY ?? "")) return this.fail("quota", "Free SerpApi quota could not be confirmed; no price search was made.");
      if (budget.remaining <= 0 || state.callTimes.length >= maxCallsPerHour()) return this.fail("quota", "Price search allowance reached; no search was made.");
      budget.remaining--;
      budget.calls++;
      state.callTimes.push(now);
    }
    const job = fn(this.provider)
      .then((r) => {
        // Cache successes and genuine "no results"; retry everything else next time.
        if (r.ok || r.reason === "empty") state.cache.set(key, { expires: this.now() + CACHE_TTL_MS, result: r as CacheEntry["result"] });
        return r;
      })
      .finally(() => state.inFlight.delete(key));
    state.inFlight.set(key, job);
    return job;
  }
}

export type PriceMode = "live" | "record" | "replay" | "off";

/** PRICE_MODE: live (default), record (live + save results), replay (saved results only). */
export function priceMode(): PriceMode {
  const mode = (process.env.PRICE_MODE ?? "live").trim().toLowerCase();
  if (mode === "replay") return "replay";
  if (!process.env.SERPAPI_API_KEY) return "off";
  return mode === "record" ? "record" : mode === "live" ? "live" : "off";
}

/** Pricing runtime for this process; unavailable when live pricing has no key and replay is off. */
export function getPricingRuntime(): PricingRuntime {
  const mode = priceMode();
  if (mode === "replay") return new PricingRuntime(createReplayProvider(), Date.now, false, `replay|${observationsDir()}`);
  if (mode === "off") return new PricingRuntime(null);
  const live = createSerpApiProvider(process.env.SERPAPI_API_KEY!);
  return new PricingRuntime(mode === "record" ? withRecording(live) : live, Date.now, true, `${mode}|${mode === "record" ? observationsDir() : ""}`);
}

/** Test helper. */
export function resetPricingState(): void {
  state.cache.clear();
  state.inFlight.clear();
  state.callTimes = [];
}

/** Run async tasks with a small concurrency limit, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Reserve one slot of the shared hourly SerpApi ceiling for a non-price call
 * (e.g. Google Events), so all SerpApi usage stays under one cap.
 */
export function takeHourlySerpApiSlot(now = Date.now()): boolean {
  state.callTimes = state.callTimes.filter((t) => now - t < HOUR_MS);
  if (state.callTimes.length >= maxCallsPerHour()) return false;
  state.callTimes.push(now);
  return true;
}
