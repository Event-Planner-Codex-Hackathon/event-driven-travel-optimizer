/**
 * SerpApi adapter for Google Flights (one-way) and Google Hotels.
 * Requests TRY, one adult, economy / one room, and validates the returned
 * currency. The API key is read on the server only and never returned.
 */
import type { ProviderFailure } from "@/contract/trip";
import { diffDays, isValidDate } from "../dates";
import { money } from "../money";
import type { FlightOffer, HotelOffer, PriceProvider, ProviderResult } from "./types";

const ENDPOINT = "https://serpapi.com/search.json";
const TIMEOUT_MS = 10_000;

type Json = Record<string, unknown>;

const GOOGLE_FLIGHTS_URL = "https://www.google.com/travel/flights";
const GOOGLE_HOTELS_URL = "https://www.google.com/travel/hotels";

function records(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((item): item is Json => item !== null && typeof item === "object" && !Array.isArray(item)) : [];
}

function record(value: unknown): Json | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;
}

function safeMajorToMinor(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const minor = Math.round(value * 100);
  return Number.isSafeInteger(minor) ? minor : undefined;
}

async function call(apiKey: string, params: Record<string, string>): Promise<{ ok: true; json: Json } | { ok: false; reason: ProviderFailure; message: string }> {
  const url = new URL(ENDPOINT);
  for (const [k, v] of Object.entries({ ...params, api_key: apiKey })) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, reason: timedOut ? "timeout" : "error", message: timedOut ? "Price provider timed out." : "Could not reach the price provider." };
  }
  const json = record(await res.json().catch(() => ({}))) ?? {};
  const error = typeof json.error === "string" ? json.error : undefined;
  if (res.status === 401 || res.status === 403) return { ok: false, reason: "auth", message: "Price provider rejected the API key." };
  if (res.status === 429 || (error && /run out of searches|rate limit|throughput/i.test(error)))
    return { ok: false, reason: "quota", message: "Price provider quota reached." };
  if (error && /hasn't returned any results|no results/i.test(error)) return { ok: false, reason: "empty", message: "No results for this search." };
  if (!res.ok || error) return { ok: false, reason: "error", message: "Price provider returned an error." };
  return { ok: true, json };
}

/** Fail closed: the provider defaults to USD, so a missing currency echo is not trusted as TRY. */
export function currencyOk(json: Json): boolean {
  const p = json.search_parameters as Json | undefined;
  return p?.currency === "TRY";
}

const datePart = (t: unknown) => {
  if (typeof t !== "string") return undefined;
  const date = /^(\d{4}-\d{2}-\d{2})(?:[ T]|$)/.exec(t)?.[1];
  return date && isValidDate(date) ? date : undefined;
};

export function parseFlights(json: Json): FlightOffer[] {
  const items = [...records(json.best_flights), ...records(json.other_flights)];
  const offers: FlightOffer[] = [];
  for (const item of items) {
    const segments = records(item.flights);
    const price = safeMajorToMinor(item.price);
    if (segments.length === 0 || price === undefined) continue;
    const dep = datePart(record(segments[0].departure_airport)?.time);
    const arr = datePart(record(segments[segments.length - 1].arrival_airport)?.time);
    if (!dep || !arr) continue; // never guess times
    const carriers = Array.from(new Set(segments.map((s) => s.airline).filter((a): a is string => typeof a === "string")));
    const numbers = segments.map((s) => s.flight_number).filter((n): n is string => typeof n === "string");
    const stops = segments.length - 1;
    offers.push({
      price: money(price, "TRY"),
      departureDate: dep,
      arrivalDate: arr,
      durationMinutes: typeof item.total_duration === "number" && Number.isFinite(item.total_duration) && item.total_duration >= 0 ? item.total_duration : undefined,
      stops,
      description: `${carriers.join(" + ") || "Flight"}${numbers.length ? ` ${numbers.join("/")}` : ""}, ${stops === 0 ? "nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`}`,
    });
  }
  return offers;
}

export function parseHotels(json: Json, nights: number): HotelOffer[] {
  if (!Number.isInteger(nights) || nights < 1 || nights > 30) return [];
  const offers: HotelOffer[] = [];
  for (const p of records(json.properties)) {
    if (typeof p.name !== "string") continue;
    const total = safeMajorToMinor(record(p.total_rate)?.extracted_lowest);
    const nightly = safeMajorToMinor(record(p.rate_per_night)?.extracted_lowest);
    let amount: number | undefined;
    let derived = false;
    if (total !== undefined) amount = total;
    else if (nightly !== undefined) {
      amount = nightly * nights;
      if (!Number.isSafeInteger(amount)) continue;
      derived = true;
    }
    if (amount === undefined) continue;
    const cls = typeof p.extracted_hotel_class === "number" ? p.extracted_hotel_class : typeof p.hotel_class === "string" ? Number.parseInt(p.hotel_class, 10) : undefined;
    offers.push({ name: p.name, total: money(amount, "TRY"), derivedFromNightly: derived, hotelClass: Number.isInteger(cls) && cls! >= 1 && cls! <= 5 ? cls : undefined });
  }
  return offers;
}

const HOTEL_CLASS = { budget: undefined, standard: "3,4", comfort: "4,5" } as const;

export function createSerpApiProvider(apiKey: string): PriceProvider {
  return {
    name: "serpapi",
    async flights(q): Promise<ProviderResult<FlightOffer>> {
      const r = await call(apiKey, {
        engine: "google_flights",
        departure_id: q.fromAirports.join(","),
        arrival_id: q.toAirports.join(","),
        outbound_date: q.date,
        type: "2",
        travel_class: "1",
        adults: "1",
        currency: "TRY",
        hl: "en",
        gl: "tr",
      });
      if (!r.ok) return r;
      if (!currencyOk(r.json)) return { ok: false, reason: "currency", message: "Provider did not return TRY prices." };
      const offers = parseFlights(r.json);
      if (offers.length === 0) return { ok: false, reason: "empty", message: "No priced flights for this search." };
      const now = new Date().toISOString();
      return { ok: true, offers, fetchedAt: now, observedAt: now, retrieval: "live", fromCache: false, searchUrl: GOOGLE_FLIGHTS_URL };
    },
    async hotels(q): Promise<ProviderResult<HotelOffer>> {
      const params: Record<string, string> = {
        engine: "google_hotels",
        q: `hotels in ${q.city}`,
        check_in_date: q.checkIn,
        check_out_date: q.checkOut,
        adults: "1",
        currency: "TRY",
        hl: "en",
        gl: "tr",
      };
      const cls = HOTEL_CLASS[q.style];
      if (cls) params.hotel_class = cls;
      else params.sort_by = "3"; // lowest price
      const r = await call(apiKey, params);
      if (!r.ok) return r;
      if (!currencyOk(r.json)) return { ok: false, reason: "currency", message: "Provider did not return TRY prices." };
      const offers = parseHotels(r.json, diffDays(q.checkIn, q.checkOut));
      if (offers.length === 0) return { ok: false, reason: "empty", message: "No priced hotels for this search." };
      const now = new Date().toISOString();
      return { ok: true, offers, fetchedAt: now, observedAt: now, retrieval: "live", fromCache: false, searchUrl: GOOGLE_HOTELS_URL };
    },
  };
}
