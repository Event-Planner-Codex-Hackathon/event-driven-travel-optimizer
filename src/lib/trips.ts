"use client";

import type { OptimizeBody, TripResponse } from "@/contract/trip";
import { readStore, useStoredValue, writeStore } from "./browserStore";

// Client-side trip state for the prototype pages (browser only).

/** What the landing form hands to the searching page. */
export type PendingSearch = {
  body: OptimizeBody;
  /** Short human label for the loading board, e.g. "ISTANBUL → SINGAPORE". */
  label: string;
  createdAt: string;
};

const PENDING_KEY = "eh:pending-search";
const tripKey = (requestId: string) => `eh:trip:${requestId}`;
const PLANNED_KEY = "eh:planned-trips";

export function setPendingSearch(search: PendingSearch): void {
  writeStore(PENDING_KEY, search);
}

export function takePendingSearch(): PendingSearch | null {
  return readStore<PendingSearch | null>(PENDING_KEY, null);
}

export function clearPendingSearch(): void {
  writeStore(PENDING_KEY, null);
}

export function saveTripResponse(trip: TripResponse): void {
  writeStore(tripKey(trip.requestId), trip);
}

export function useTripResponse(requestId: string): TripResponse | null {
  return useStoredValue<TripResponse | null>(tripKey(requestId), null);
}

/** A trip the signed-in traveler kept on their dashboard. */
export type PlannedTrip = {
  requestId: string;
  savedAt: string;
  ownerEmail: string;
  eventName: string;
  eventCity: string;
  eventStart: string;
  eventEnd: string;
  optionId: string;
  title: string;
  path: string;
  total: { amountMinor: number; currency: string };
  budget: { amountMinor: number; currency: string };
  withinBudget: boolean;
};

export function usePlannedTrips(ownerEmail: string | null): PlannedTrip[] {
  const all = useStoredValue<PlannedTrip[]>(PLANNED_KEY, []);
  return ownerEmail ? all.filter((trip) => trip.ownerEmail === ownerEmail) : [];
}

export function savePlannedTrip(trip: PlannedTrip): void {
  const all = readStore<PlannedTrip[]>(PLANNED_KEY, []);
  const rest = all.filter((t) => !(t.requestId === trip.requestId && t.ownerEmail === trip.ownerEmail));
  writeStore(PLANNED_KEY, [trip, ...rest].slice(0, 50));
}

export function removePlannedTrip(requestId: string, ownerEmail: string): void {
  const all = readStore<PlannedTrip[]>(PLANNED_KEY, []);
  writeStore(
    PLANNED_KEY,
    all.filter((t) => !(t.requestId === requestId && t.ownerEmail === ownerEmail)),
  );
}

export function isPlanned(trips: PlannedTrip[], requestId: string): boolean {
  return trips.some((t) => t.requestId === requestId);
}
