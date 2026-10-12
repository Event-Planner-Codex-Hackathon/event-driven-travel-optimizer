/**
 * Independent hard-constraint checker. Runs on every built option, so a
 * planner bug can never silently ship an itinerary that misses the event.
 */
import type { CityStop, Leg, NormalizedRequest, Stay } from "@/contract/trip";
import { diffDays, eachDate, formatShort } from "./dates";

export type ConstraintResult = { ok: boolean; violations: string[] };

export function checkHardConstraints(
  req: NormalizedRequest,
  citySequence: CityStop[],
  legs: Leg[],
  stays: Stay[],
): ConstraintResult {
  const violations: string[] = [];
  const origin = req.origin.city;

  // Route connectivity: origin → … → origin, each leg starts where the last ended.
  if (legs.length === 0) violations.push("Route has no legs.");
  else {
    if (legs[0].fromCity !== origin) violations.push(`Route must start in ${origin}.`);
    if (legs[legs.length - 1].toCity !== origin) violations.push(`Route must end in ${origin}.`);
  }
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.arrivalDate < leg.departureDate) violations.push(`${leg.fromCity} → ${leg.toCity} arrives before it departs.`);
    if (i > 0) {
      const prev = legs[i - 1];
      if (prev.toCity !== leg.fromCity) violations.push(`Leg ${i + 1} departs ${leg.fromCity} but the traveler is in ${prev.toCity}.`);
      if (leg.departureDate < prev.arrivalDate) violations.push(`Leg ${i + 1} departs before leg ${i} arrives.`);
    }
  }

  // Travel window.
  if (legs.length > 0) {
    if (legs[0].departureDate < req.travelWindow.startDate)
      violations.push(`Departs ${formatShort(legs[0].departureDate)}, before the travel window opens (${formatShort(req.travelWindow.startDate)}).`);
    const last = legs[legs.length - 1];
    if (last.arrivalDate > req.travelWindow.endDate)
      violations.push(`Returns ${formatShort(last.arrivalDate)}, after the travel window closes (${formatShort(req.travelWindow.endDate)}).`);
  }

  // Event lock: in the event city for the whole of every event date
  // (arrived on an earlier date and leaving on a later date).
  const eventStops = citySequence.filter((s) => s.city === req.event.city && s.purpose === "event");
  for (const date of eachDate(req.event.startDate, req.event.endDate)) {
    const present = eventStops.some((s) => s.arrivalDate < date && s.departureDate > date);
    if (!present) violations.push(`Not in ${req.event.city} for the full day of ${formatShort(date)} (${req.event.name}).`);
  }

  // Stays must match their dates and be non-negative.
  for (const stay of stays) {
    if (stay.nights !== diffDays(stay.checkIn, stay.checkOut) || stay.nights < 0)
      violations.push(`Stay in ${stay.city} has inconsistent nights.`);
  }

  return { ok: violations.length === 0, violations };
}
