/**
 * Cost estimator boundary. The planner only talks to the `Estimator`
 * interface, so a provider adapter (flights/hotels API) can replace the
 * heuristic implementation without touching planning or scoring.
 */
import type { Leg, LodgingStyle, Money, Stay } from "@/contract/trip";
import { CITIES, FLIGHT_MODEL, type CityInfo } from "./catalog";
import { addDays, diffDays } from "./dates";
import { major } from "./money";

export interface Estimator {
  flight(from: CityInfo, to: CityInfo, departureDate: string): Leg;
  stay(city: CityInfo, checkIn: string, checkOut: string, style: LodgingStyle): Stay;
  /** Food + activities for a number of days in a city. */
  foodAndActivities(city: CityInfo, days: number): Money;
  /** Local transport for days in a city, plus one arrival and one departure transfer. */
  localTransport(city: CityInfo, days: number): Money;
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: CityInfo, b: CityInfo): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Distance-based heuristic: fare ≈ TRY/km, duration ≈ cruise speed + fixed overhead. */
export const heuristicEstimator: Estimator = {
  flight(from, to, departureDate) {
    const km = distanceKm(from, to);
    const stops = km > FLIGHT_MODEL.nonstopMaxKm ? 1 : 0;
    const fare = Math.max(FLIGHT_MODEL.minimumFare, Math.round((km * FLIGHT_MODEL.tryPerKm) / 100) * 100);
    const durationMinutes =
      Math.round((km / FLIGHT_MODEL.cruiseKmh) * 60) +
      FLIGHT_MODEL.taxiAndClimbMinutes +
      stops * FLIGHT_MODEL.connectionMinutes;
    const arrivalDate = km >= FLIGHT_MODEL.overnightMinKm ? addDays(departureDate, 1) : departureDate;
    return {
      fromCity: from.city,
      toCity: to.city,
      departureDate,
      arrivalDate,
      mode: "flight",
      durationMinutes,
      stops,
      estimatedCost: major(fare),
      estimateSource: "heuristic",
    };
  },

  stay(city, checkIn, checkOut, style) {
    const nights = diffDays(checkIn, checkOut);
    return {
      city: city.city,
      checkIn,
      checkOut,
      nights,
      style,
      estimatedCost: major(city.nightly[style] * nights),
      estimateSource: "mock",
    };
  },

  foodAndActivities(city, days) {
    return major(city.dailyFood * days);
  },

  localTransport(city, days) {
    return major(city.dailyLocal * days + city.airportTransfer * 2);
  },
};

export function cityInfo(name: string): CityInfo {
  const found = CITIES.find((c) => c.city === name);
  if (!found) throw new Error(`Unknown city in catalog: ${name}`);
  return found;
}
