/**
 * Live price provider boundary. The planner never calls a provider; the
 * price-check and quote services do, for a bounded set of queries.
 */
import type { LodgingStyle, Money, ProviderFailure } from "@/contract/trip";

export type FlightQuery = { fromAirports: string[]; toAirports: string[]; date: string };
export type HotelQuery = { city: string; checkIn: string; checkOut: string; style: LodgingStyle };

export type FlightOffer = {
  price: Money;
  departureDate: string;
  arrivalDate: string;
  durationMinutes?: number;
  stops: number;
  description: string;
};

export type HotelOffer = {
  name: string;
  /** Total for the whole stay. */
  total: Money;
  /** True when the total was computed as nightly rate × nights. */
  derivedFromNightly: boolean;
  hotelClass?: number;
};

export type ProviderSuccess<T> = {
  ok: true;
  offers: T[];
  fetchedAt: string;
  fromCache: boolean;
  /** "replay" results come from recorded observations, never from a live call. */
  retrieval: "live" | "replay";
  /** When the provider produced the result (original time for replays). */
  observedAt: string;
  /** Public search page; never contains credentials. */
  searchUrl?: string;
};

export type ProviderError = { ok: false; reason: ProviderFailure; message: string };

export type ProviderResult<T> = ProviderSuccess<T> | ProviderError;

export interface PriceProvider {
  readonly name: string;
  /** Cache isolation for wrappers/modes; contains no credentials. */
  readonly cacheScope?: string;
  flights(q: FlightQuery): Promise<ProviderResult<FlightOffer>>;
  hotels(q: HotelQuery): Promise<ProviderResult<HotelOffer>>;
}
