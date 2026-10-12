/**
 * Single price lookup (no trip needed): one flight route/date or one hotel
 * stay. Always returns the heuristic estimate next to the provider result so
 * the two are never confused.
 */
import type { QuoteResponse } from "@/contract/trip";
import { findCity } from "./catalog";
import { diffDays } from "./dates";
import { heuristicEstimator } from "./estimates";
import { formatMoney } from "./money";
import { createBudget, type PricingRuntime } from "./providers/runtime";
import type { quoteBodySchema } from "@/contract/trip";
import type { z } from "zod";

type QuoteInput = z.output<typeof quoteBodySchema>;
/** `spentProviderCall`: a new provider request was attempted, even if it failed. */
export type QuoteResult = { ok: true; response: QuoteResponse; spentProviderCall: boolean } | { ok: false; message: string };

const MAX_OFFERS = 3;

export async function quotePrice(input: QuoteInput, runtime: PricingRuntime, today: string): Promise<QuoteResult> {
  if (input.kind === "flight") {
    const from = findCity(input.from);
    const to = findCity(input.to);
    if (!from || !to) return { ok: false, message: `Unknown city "${!from ? input.from : input.to}".` };
    if (from.city === to.city) return { ok: false, message: "Choose two different cities." };
    if (input.date < today) return { ok: false, message: "Choose a date from today onwards." };

    const estimate = heuristicEstimator.flight(from, to, input.date);
    const budget = createBudget(1);
    const r = await runtime.flights({ fromAirports: from.airports, toAirports: to.airports, date: input.date }, budget);
    return {
      ok: true,
      spentProviderCall: budget.calls > 0,
      response: {
        kind: "flight",
        query: { from: from.city, to: to.city, date: input.date },
        estimate: { price: estimate.estimatedCost, estimateSource: "heuristic" },
        provider: r.ok
          ? {
              status: "ok",
              fetchedAt: r.fetchedAt,
              fromCache: r.fromCache,
              retrieval: r.retrieval,
              observedAt: r.observedAt,
              ...(r.searchUrl ? { searchUrl: r.searchUrl } : {}),
              offers: r.offers
                .filter((o) => o.departureDate === input.date)
                .sort((a, b) => a.price.amountMinor - b.price.amountMinor)
                .slice(0, MAX_OFFERS)
                .map((o) => ({ price: o.price, description: o.description, departureDate: o.departureDate, arrivalDate: o.arrivalDate, durationMinutes: o.durationMinutes, stops: o.stops })),
            }
          : { status: "unavailable", reason: r.reason, message: r.message },
        scope: `1 adult, economy, one-way, ${from.airports.join("/")} → ${to.airports.join("/")}, prices in TRY. Search results, not bookable quotes.`,
      },
    };
  }

  const city = findCity(input.city);
  if (!city) return { ok: false, message: `Unknown city "${input.city}".` };
  const nights = diffDays(input.checkIn, input.checkOut);
  if (nights < 1 || nights > 30) return { ok: false, message: "Stay must be between 1 and 30 nights." };
  if (input.checkIn < today) return { ok: false, message: "Choose a check-in date from today onwards." };

  const estimate = heuristicEstimator.stay(city, input.checkIn, input.checkOut, input.style);
  const budget = createBudget(1);
  const r = await runtime.hotels({ city: city.city, checkIn: input.checkIn, checkOut: input.checkOut, style: input.style }, budget);
  return {
    ok: true,
    spentProviderCall: budget.calls > 0,
    response: {
      kind: "hotel",
      query: { city: city.city, checkIn: input.checkIn, checkOut: input.checkOut, nights, style: input.style },
      estimate: { price: estimate.estimatedCost, estimateSource: "mock" },
      provider: r.ok
        ? {
            status: "ok",
            fetchedAt: r.fetchedAt,
            fromCache: r.fromCache,
            retrieval: r.retrieval,
            observedAt: r.observedAt,
            ...(r.searchUrl ? { searchUrl: r.searchUrl } : {}),
            offers: [...r.offers]
              .sort((a, b) => a.total.amountMinor - b.total.amountMinor)
              .slice(0, MAX_OFFERS)
              .map((o) => ({
                price: o.total,
                description: `${o.name}${o.hotelClass ? ` (${o.hotelClass}★)` : ""} · ${formatMoney(o.total)} total`,
                totalDerived: o.derivedFromNightly,
              })),
          }
        : { status: "unavailable", reason: r.reason, message: r.message },
      scope: `1 adult, 1 room, ${nights} night${nights === 1 ? "" : "s"} in ${city.city}, ${input.style} lodging, total in TRY. Search results, not bookable quotes.`,
    },
  };
}
