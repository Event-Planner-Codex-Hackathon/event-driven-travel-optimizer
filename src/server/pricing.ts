/**
 * Live price check for an existing plan. Prices only the legs and stays of
 * the three returned options (deduplicated, cached, call-capped), never
 * re-enumerates routes, then re-scores and re-ranks those three options.
 * Lines without a usable provider price keep their estimate, visibly.
 */
import type { Leg, PricingSummary, RouteOption, Stay, TripResponse } from "@/contract/trip";
import { cityInfo } from "./estimates";
import { formatShort } from "./dates";
import { formatMoney } from "./money";
import { evaluateCandidate, specFromOption, type Candidate } from "./planner";
import type { FlightOffer, HotelOffer, ProviderResult } from "./providers/types";
import { createBudget, mapLimit, maxCallsPerCheck, type PricingRuntime } from "./providers/runtime";
import { saveTrip } from "./store";
import { assembleReadyResponse, requestAssumptions } from "./trips";

const CONCURRENCY = 3;

export class PriceCheckFailure extends Error {
  constructor(readonly providerCalls: number, options?: ErrorOptions) {
    super("Live price check failed.", options);
  }
}

type FlightJob = { kind: "flight"; key: string; leg: Leg };
type HotelJob = { kind: "hotel"; key: string; stay: Stay };
type Job = FlightJob | HotelJob;

const flightKey = (l: Leg) => `${l.fromCity}>${l.toCity}@${l.departureDate}`;
const hotelKey = (s: Stay) => `${s.city}@${s.checkIn}/${s.checkOut}/${s.style}`;

/**
 * Pick the cheapest fare that departs and lands on exactly the planned days.
 * Later arrivals would break the plan; earlier ones would leave a night and a
 * day of costs unpriced, so both keep the estimate instead.
 */
export function chooseFlight(leg: Leg, offers: FlightOffer[]): FlightOffer | undefined {
  return offers
    .filter((o) => o.departureDate === leg.departureDate && o.arrivalDate === leg.arrivalDate)
    .sort((a, b) => a.price.amountMinor - b.price.amountMinor)[0];
}

/** Budget style takes the cheapest; standard/comfort take the lower median of the class-filtered list. */
export function chooseHotel(stay: Stay, offers: HotelOffer[]): HotelOffer | undefined {
  const sorted = [...offers].sort((a, b) => a.total.amountMinor - b.total.amountMinor);
  if (sorted.length === 0) return undefined;
  return stay.style === "budget" ? sorted[0] : sorted[Math.floor((sorted.length - 1) / 2)];
}

export async function priceCheckTrip(prev: TripResponse, runtime: PricingRuntime): Promise<TripResponse> {
  const req = prev.normalizedRequest;
  if (prev.status !== "ready" || !req) throw new Error("Price check needs a ready trip.");

  // Recommended option first, so the call cap covers it before the others.
  const ordered = [...prev.options].sort((a, b) => Number(b.id === prev.recommendedOptionId) - Number(a.id === prev.recommendedOptionId));
  const jobs = new Map<string, Job>();
  for (const o of ordered) {
    for (const leg of o.legs) jobs.set(flightKey(leg), jobs.get(flightKey(leg)) ?? { kind: "flight", key: flightKey(leg), leg });
    for (const stay of o.stays) jobs.set(hotelKey(stay), jobs.get(hotelKey(stay)) ?? { kind: "hotel", key: hotelKey(stay), stay });
  }

  const budget = createBudget(maxCallsPerCheck());
  const jobList = [...jobs.values()];
  type AnyResult = ProviderResult<FlightOffer> | ProviderResult<HotelOffer>;
  let results: AnyResult[];
  try {
    results = await mapLimit<Job, AnyResult>(jobList, CONCURRENCY, (job) =>
      job.kind === "flight"
        ? runtime.flights({ fromAirports: cityInfo(job.leg.fromCity).airports, toAirports: cityInfo(job.leg.toCity).airports, date: job.leg.departureDate }, budget)
        : runtime.hotels({ city: job.stay.city, checkIn: job.stay.checkIn, checkOut: job.stay.checkOut, style: job.stay.style }, budget),
    );
  } catch (cause) {
    // Preserve whether provider requests were already attempted so the route
    // can account for them conservatively when a later job throws.
    throw new PriceCheckFailure(budget.calls, { cause });
  }
  const byKey = new Map<string, AnyResult>();
  jobList.forEach((job, i) => byKey.set(job.key, results[i]));

  const failureNotes = new Set<string>();
  let priced = 0;
  let total = 0;

  const repriced: Candidate[] = prev.options.map((o: RouteOption) => {
    const warnings: string[] = [];
    const legs = o.legs.map((leg): Leg => {
      total++;
      const r = byKey.get(flightKey(leg)) as ProviderResult<FlightOffer> | undefined;
      const base: Leg = { ...leg, estimateSource: leg.estimateSource === "provider" ? "heuristic" : leg.estimateSource, source: undefined };
      if (!r || !r.ok) {
        if (r) failureNotes.add(r.message);
        return base;
      }
      const offer = chooseFlight(leg, r.offers);
      if (!offer) {
        warnings.push(`No live fare ${leg.fromCity} → ${leg.toCity} departing ${formatShort(leg.departureDate)} and landing ${formatShort(leg.arrivalDate)} as planned; using the estimate.`);
        return base;
      }
      priced++;
      return {
        ...leg,
        durationMinutes: offer.durationMinutes ?? leg.durationMinutes,
        stops: offer.stops,
        estimatedCost: offer.price,
        estimateSource: "provider",
        source: { provider: "serpapi", product: "google_flights", fetchedAt: r.fetchedAt, fromCache: r.fromCache, description: offer.description, ...(r.searchUrl ? { searchUrl: r.searchUrl } : {}) },
      };
    });

    const stays = o.stays.map((stay): Stay => {
      total++;
      const r = byKey.get(hotelKey(stay)) as ProviderResult<HotelOffer> | undefined;
      const base: Stay = { ...stay, estimateSource: stay.estimateSource === "provider" ? "mock" : stay.estimateSource, source: undefined };
      if (!r || !r.ok) {
        if (r) failureNotes.add(r.message);
        return base;
      }
      const offer = chooseHotel(stay, r.offers);
      if (!offer) return base;
      priced++;
      const notes = offer.derivedFromNightly ? ["Stay total derived from the nightly rate × nights."] : undefined;
      return {
        ...stay,
        estimatedCost: offer.total,
        estimateSource: "provider",
        source: {
          provider: "serpapi",
          product: "google_hotels",
          fetchedAt: r.fetchedAt,
          fromCache: r.fromCache,
          description: `${offer.name}${offer.hotelClass ? ` (${offer.hotelClass}★)` : ""} · ${formatMoney(offer.total)} for ${stay.nights} night${stay.nights === 1 ? "" : "s"}`,
          ...(r.searchUrl ? { searchUrl: r.searchUrl } : {}),
          ...(notes ? { notes } : {}),
        },
      };
    });

    return evaluateCandidate(req, specFromOption(o, req), o.citySequence, legs, stays, undefined, warnings);
  });

  const pricing: PricingSummary = {
    mode: priced === 0 ? "estimates" : priced === total ? "provider" : "mixed",
    checkedAt: new Date().toISOString(),
    providerCalls: budget.calls,
    cacheHits: budget.cacheHits,
    notes: [
      `${priced} of ${total} flight and hotel lines use provider prices (Google Flights / Google Hotels via SerpApi; 1 adult, economy one-way, 1 room, TRY). Provider results may be cached upstream; they are search results, not bookable quotes.`,
      "Food, local transport and the contingency are always estimates, so totals are never fully live.",
      ...failureNotes,
    ],
  };

  // Request-specific assumptions carry over; global ones are regenerated for the new pricing mode.
  const carried = requestAssumptions(prev);
  const response = assembleReadyResponse(req, repriced, carried, { requirementsVersion: prev.requirementsVersion + 1, previousRequestId: prev.requestId }, pricing);
  saveTrip(response);
  return response;
}
