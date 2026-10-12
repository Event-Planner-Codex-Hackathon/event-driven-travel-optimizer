"use client";

import { readStore, useStoredValue, writeStore } from "./browserStore";

/** Frontend context only. This is not a claim about preferences understood by the planner. */
export type TripBrief = { description: string; interests?: string };
const key = (requestId: string) => `eh:brief:${requestId}`;

export function saveTripBrief(requestId: string, brief: TripBrief) {
  writeStore(key(requestId), brief);
}

export function carryTripBrief(from: string, to: string) {
  const brief = readStore<TripBrief | null>(key(from), null);
  if (brief) saveTripBrief(to, brief);
}

export function useTripBrief(requestId: string) {
  return useStoredValue<TripBrief | null>(key(requestId), null);
}
