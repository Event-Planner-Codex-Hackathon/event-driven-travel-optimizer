/**
 * Reference exchange rates from Frankfurter (no key). Rates are daily
 * reference rates — fine for display and for converting a stated budget,
 * never presented as a payment or booking rate.
 */
import type { FxInfo } from "@/contract/trip";
import { isValidDate } from "../dates";

const ENDPOINT = "https://api.frankfurter.dev/v2/rates";
export const FX_QUOTES = ["EUR", "USD", "GBP"] as const;
const CACHE_TTL_MS = 6 * 60 * 60_000;
const TIMEOUT_MS = 4_000;

type State = { value?: FxInfo; expires: number; inFlight?: Promise<FxInfo | null> };
const g = globalThis as typeof globalThis & { __eventhopperFx?: State };
const state: State = (g.__eventhopperFx ??= { expires: 0 });

/** Parse the v2 response: [{ date, base, quote, rate }, ...]. Returns null unless every quote is valid. */
export function parseFrankfurter(json: unknown, base = "TRY", quotes: readonly string[] = FX_QUOTES): FxInfo | null {
  if (!Array.isArray(json)) return null;
  const rates: Record<string, number> = {};
  let date: string | undefined;
  for (const row of json as Array<Record<string, unknown>>) {
    if (row?.base !== base || typeof row.quote !== "string" || !quotes.includes(row.quote)) continue;
    if (typeof row.rate !== "number" || !(row.rate > 0) || !Number.isFinite(row.rate)) continue;
    if (typeof row.date !== "string" || !isValidDate(row.date)) continue;
    if ((date && row.date !== date) || row.quote in rates) return null;
    rates[row.quote] = row.rate;
    date = row.date;
  }
  if (!date || quotes.some((q) => !(q in rates))) return null;
  return {
    base,
    rates,
    date,
    source: "frankfurter",
    note: `Reference rates from Frankfurter dated ${date}. For display and budget conversion only — not a payment or booking rate.`,
  };
}

/** Cached TRY→EUR/USD/GBP rates, or null when unavailable (callers must handle null). */
export async function getFxRates(fetcher: typeof fetch = fetch, now = Date.now()): Promise<FxInfo | null> {
  if (state.value && state.expires > now) return state.value;
  if (state.inFlight) return state.inFlight;
  const url = `${ENDPOINT}?base=TRY&quotes=${FX_QUOTES.join(",")}`;
  state.inFlight = fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" })
    .then(async (res) => (res.ok ? parseFrankfurter(await res.json()) : null))
    .catch(() => null)
    .then((fx) => {
      if (fx) {
        state.value = fx;
        state.expires = now + CACHE_TTL_MS;
      }
      return fx ?? (state.value ?? null); // fall back to the last good rates, which keep their own date
    })
    .finally(() => {
      state.inFlight = undefined;
    });
  return state.inFlight;
}

/** Test helper. */
export function resetFxState(): void {
  state.value = undefined;
  state.expires = 0;
  state.inFlight = undefined;
}
