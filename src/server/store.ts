/**
 * In-memory store for the running demo. Not durable: a server restart or a
 * serverless cold start forgets everything, which is why reoptimize and hero
 * endpoints accept fallback context in the request body.
 */
import type { HeroImage, RouteOption, TripResponse } from "@/contract/trip";

const MAX_TRIPS = 200;

type Store = {
  trips: Map<string, TripResponse>;
  routes: Map<string, RouteOption>;
  heroByPrompt: Map<string, HeroImage>;
  heroGenerations: number;
};

// Survive Next.js dev hot reloads.
const g = globalThis as typeof globalThis & { __eventhopperStore?: Store };
const store: Store = (g.__eventhopperStore ??= {
  trips: new Map(),
  routes: new Map(),
  heroByPrompt: new Map(),
  heroGenerations: 0,
});

export function saveTrip(trip: TripResponse): void {
  store.trips.set(trip.requestId, trip);
  for (const o of trip.options) store.routes.set(o.id, o);
  if (store.trips.size > MAX_TRIPS) {
    const oldest = store.trips.keys().next().value!;
    for (const o of store.trips.get(oldest)!.options) store.routes.delete(o.id);
    store.trips.delete(oldest);
  }
}

export const getTrip = (id: string) => store.trips.get(id);
export const getRoute = (id: string) => store.routes.get(id);

export const heroCache = {
  get: (key: string) => store.heroByPrompt.get(key),
  set: (key: string, value: HeroImage) => store.heroByPrompt.set(key, value),
  delete: (key: string) => store.heroByPrompt.delete(key),
};

export const heroBudget = {
  used: () => store.heroGenerations,
  increment: () => ++store.heroGenerations,
};
