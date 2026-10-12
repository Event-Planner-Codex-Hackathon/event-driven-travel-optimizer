/**
 * Quota-safe access to the live price provider:
 * - 15-minute cache keyed by the exact query (budget-only changes cost nothing);
 * - identical concurrent queries share one call;
 * - a per-operation call budget and a rolling hourly ceiling for the process
 *   (free plan: stay under the provider's hourly limit, never pay overage).
 */
import type { ProviderFailure } from "@/contract/trip";
import { createSerpApiProvider } from "./serpapi";
import type { FlightOffer, FlightQuery, HotelOffer, HotelQuery, PriceProvider, ProviderResult } from "./types";

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

    if (budget.remaining <= 0) return this.fail("quota", "Live price lookups for this request reached their limit.");
    state.callTimes = state.callTimes.filter((t) => now - t < HOUR_MS);
    if (state.callTimes.length >= maxCallsPerHour()) return this.fail("quota", "Hourly live price limit reached. Try again later.");

    budget.remaining--;
    budget.calls++;
    state.callTimes.push(now);
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

/** Live pricing for this process, or an unavailable runtime when SERPAPI_API_KEY is unset. */
export function getPricingRuntime(): PricingRuntime {
  const key = process.env.SERPAPI_API_KEY;
  return new PricingRuntime(key ? createSerpApiProvider(key) : null);
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
