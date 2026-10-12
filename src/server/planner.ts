/**
 * Deterministic route planner.
 *
 * 1. Enumerate bounded candidates per route family (event-focus, stop before
 *    the event, stop after the event, …) × lodging style × stopover nights.
 * 2. Price every component through the Estimator; add a fixed contingency.
 * 3. Drop candidates that fail the independent hard-constraint checker.
 * 4. Score (budget fit, travel efficiency, preference fit) and keep the best
 *    candidate per family, then pick three distinct families.
 */
import type {
  CityStop,
  Leg,
  LodgingStyle,
  Money,
  NormalizedRequest,
  RouteOption,
  Stay,
} from "@/contract/trip";
import { PLANNING_RULES, SCORE_WEIGHTS, type CityInfo } from "./catalog";
import { checkHardConstraints } from "./constraints";
import { addDays, diffDays, formatShort } from "./dates";
import { cityInfo, heuristicEstimator, type Estimator } from "./estimates";
import { formatMoney, money, sum } from "./money";

export type Pattern = "event-focus" | "pre-event-stop" | "post-event-stop" | "lean" | "early-arrival";

type CandidateSpec = {
  pattern: Pattern;
  stop?: CityInfo;
  stopNights: number;
  style: LodgingStyle;
  /** Extra nights in the event city before the arrival buffer day. */
  extraNights: number;
};

export type Candidate = Omit<RouteOption, "id" | "label" | "highlights"> & {
  family: string;
  spec: CandidateSpec;
  travelMinutes: number;
};

const STYLES: LodgingStyle[] = ["budget", "standard", "comfort"];
const MAX_STOP_NIGHTS = 5;
const IDEAL_STOP_NIGHTS = { relaxed: 3, balanced: 2, fast: 1 } as const;

/** Build a flight that lands on `arrivalDate` (overnight legs depart the day before). */
function flightArriving(est: Estimator, from: CityInfo, to: CityInfo, arrivalDate: string): Leg {
  const probe = est.flight(from, to, arrivalDate);
  const offset = diffDays(probe.departureDate, probe.arrivalDate);
  return est.flight(from, to, addDays(arrivalDate, -offset));
}

function buildCandidate(req: NormalizedRequest, spec: CandidateSpec, est: Estimator): Candidate {
  const currency = req.budget.currency;
  const origin = cityInfo(req.origin.city);
  const eventCity = cityInfo(req.event.city);
  const eventArrive = addDays(req.event.startDate, -PLANNING_RULES.arrivalBufferDays - spec.extraNights);
  const eventDepart = addDays(req.event.endDate, PLANNING_RULES.departureBufferDays);

  const legs: Leg[] = [];
  const visits: Array<{ city: CityInfo; arrive: string; depart: string; purpose: "stopover" | "event" }> = [];

  if (spec.pattern === "pre-event-stop" && spec.stop) {
    const toEvent = flightArriving(est, spec.stop, eventCity, eventArrive);
    const stopCheckIn = addDays(toEvent.departureDate, -spec.stopNights);
    legs.push(flightArriving(est, origin, spec.stop, stopCheckIn), toEvent);
    visits.push({ city: spec.stop, arrive: stopCheckIn, depart: toEvent.departureDate, purpose: "stopover" });
  } else {
    legs.push(flightArriving(est, origin, eventCity, eventArrive));
  }
  visits.push({ city: eventCity, arrive: eventArrive, depart: eventDepart, purpose: "event" });

  if (spec.pattern === "post-event-stop" && spec.stop) {
    const toStop = est.flight(eventCity, spec.stop, eventDepart);
    const stopCheckOut = addDays(toStop.arrivalDate, spec.stopNights);
    legs.push(toStop, est.flight(spec.stop, origin, stopCheckOut));
    visits.push({ city: spec.stop, arrive: toStop.arrivalDate, depart: stopCheckOut, purpose: "stopover" });
  } else {
    legs.push(est.flight(eventCity, origin, eventDepart));
  }

  const stays: Stay[] = visits.map((v) => est.stay(v.city, v.arrive, v.depart, spec.style));
  const citySequence: CityStop[] = [
    { city: origin.city, countryCode: origin.countryCode, arrivalDate: legs[0].departureDate, departureDate: legs[0].departureDate, purpose: "origin" },
    ...visits.map((v) => ({ city: v.city.city, countryCode: v.city.countryCode, arrivalDate: v.arrive, departureDate: v.depart, purpose: v.purpose })),
    { city: origin.city, countryCode: origin.countryCode, arrivalDate: legs[legs.length - 1].arrivalDate, departureDate: legs[legs.length - 1].arrivalDate, purpose: "origin" },
  ];

  // ---- Costs
  const transport = sum(legs.map((l) => l.estimatedCost), currency);
  const lodging = sum(stays.map((s) => s.estimatedCost), currency);
  const localTransport = sum(
    [
      ...visits.map((v) => est.localTransport(v.city, diffDays(v.arrive, v.depart))),
      money(origin.airportTransfer * 2 * 100, currency),
    ],
    currency,
  );
  const foodAndActivities = sum(visits.map((v) => est.foodAndActivities(v.city, diffDays(v.arrive, v.depart))), currency);
  const subtotal = transport.amountMinor + lodging.amountMinor + localTransport.amountMinor + foodAndActivities.amountMinor;
  const contingency = money(Math.round(subtotal * PLANNING_RULES.contingencyRate), currency);
  const total = sum([transport, lodging, localTransport, foodAndActivities, contingency], currency);
  const remaining = money(req.budget.amountMinor - total.amountMinor, currency);
  const withinBudget = remaining.amountMinor >= 0;

  // ---- Constraints
  const check = checkHardConstraints(req, citySequence, legs, stays);
  const warnings = [...check.violations];
  if (!withinBudget) warnings.push(`Over budget by ${formatMoney(money(-remaining.amountMinor, currency))}.`);
  else if (remaining.amountMinor < req.budget.amountMinor * 0.05)
    warnings.push(`Tight: only ${formatMoney(remaining)} left for surprises beyond the ${PLANNING_RULES.contingencyRate * 100}% contingency.`);
  const longLeg = legs.find((l) => (l.durationMinutes ?? 0) > 13 * 60);
  if (longLeg) warnings.push(`${longLeg.fromCity} → ${longLeg.toCity} is a long flight (~${Math.round((longLeg.durationMinutes ?? 0) / 60)}h).`);

  const travelMinutes = legs.reduce((m, l) => m + (l.durationMinutes ?? 0), 0);
  const score = scoreCandidate(req, spec, legs, total, travelMinutes);

  const assumptions = [
    `${spec.style[0].toUpperCase()}${spec.style.slice(1)} lodging for ${stays.reduce((n, s) => n + s.nights, 0)} nights.`,
    `Arrive in ${eventCity.city} ${formatShort(eventArrive)}, leave ${formatShort(eventDepart)}.`,
  ];
  if (spec.stop) assumptions.push(`${spec.stop.city}: ${spec.stopNights} night${spec.stopNights === 1 ? "" : "s"}.`);

  const family = spec.stop ? `${spec.pattern}:${spec.stop.city}` : spec.pattern;
  return {
    family,
    spec,
    travelMinutes,
    pattern: spec.pattern,
    title: titleFor(req, spec),
    summary: "",
    citySequence,
    event: { name: req.event.name, city: req.event.city, startDate: req.event.startDate, endDate: req.event.endDate, locked: true },
    legs,
    stays,
    costBreakdown: { transport, lodging, localTransport, foodAndActivities, contingency, total, budget: req.budget, remaining },
    feasibility: {
      feasible: check.ok && withinBudget,
      withinBudget,
      hardConstraintsSatisfied: check.ok,
      warnings,
    },
    score,
    assumptions,
    heroImage: { status: "not_requested" },
  };
}

function titleFor(req: NormalizedRequest, spec: CandidateSpec): string {
  const ev = req.event.name;
  switch (spec.pattern) {
    case "pre-event-stop":
      return `${spec.stop!.city} warm-up, then ${ev}`;
    case "post-event-stop":
      return `${ev}, then ${spec.stop!.city}`;
    case "lean":
      return `Lean ${ev} trip`;
    case "early-arrival":
      return `Early arrival in ${req.event.city}`;
    default:
      return `Straight to ${ev}`;
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function scoreCandidate(
  req: NormalizedRequest,
  spec: CandidateSpec,
  legs: Leg[],
  total: Money,
  travelMinutes: number,
): RouteOption["score"] {
  // Budget fit: 80–100 when within budget (some credit for savings, a penalty when
  // less than 5% is left), and falls steeply once over budget.
  const ratio = total.amountMinor / req.budget.amountMinor;
  const budgetFit =
    ratio <= 1 ? 80 + 20 * (1 - ratio) - (ratio > 0.95 ? 10 : 0) : Math.max(0, 50 - 250 * (ratio - 1));

  // Travel efficiency: fewer hours in the air, fewer legs and connections.
  const stops = legs.reduce((n, l) => n + (l.stops ?? 0), 0);
  const travelEfficiency = clamp(100 - Math.min(60, (travelMinutes / 60) * 1.5) - (legs.length - 2) * 8 - stops * 5);

  // Preference fit: optional cities, stopover length vs pace, lodging style, max stops.
  let preferenceFit = 50;
  const wanted = req.optionalCities.map((c) => c.city);
  if (wanted.length === 0) preferenceFit += spec.stop ? 0 : 30;
  else if (spec.stop && wanted.includes(spec.stop.city)) preferenceFit += spec.stop.city === wanted[0] ? 35 : 30;
  if (spec.stop) {
    const ideal = IDEAL_STOP_NIGHTS[req.preferences.preferredPace ?? "balanced"];
    preferenceFit -= Math.abs(spec.stopNights - ideal) * 6;
  }
  const pref = req.preferences.lodgingStyle;
  if (pref) preferenceFit += spec.style === pref ? 20 : Math.abs(STYLES.indexOf(spec.style) - STYLES.indexOf(pref)) === 1 ? 5 : 0;
  else preferenceFit += spec.style === "standard" ? 15 : spec.style === "comfort" ? 8 : 5;
  const intermediateStops = legs.length - 2;
  if (req.preferences.maxStops !== undefined && intermediateStops > req.preferences.maxStops) preferenceFit -= 30;

  const b = round1(budgetFit);
  const e = round1(travelEfficiency);
  const p = round1(clamp(preferenceFit));
  const totalScore = round1(SCORE_WEIGHTS.budgetFit * b + SCORE_WEIGHTS.travelEfficiency * e + SCORE_WEIGHTS.preferenceFit * p);
  return { total: totalScore, budgetFit: b, travelEfficiency: e, preferenceFit: p };
}

/**
 * Feasible first, then higher score. When neither fits the budget, the
 * cheaper one wins (closest to affordable). Ties: cheaper, then family name.
 */
export function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.feasibility.feasible !== b.feasibility.feasible) return a.feasibility.feasible ? -1 : 1;
  if (a.feasibility.feasible && a.score.total !== b.score.total) return b.score.total - a.score.total;
  if (a.costBreakdown.total.amountMinor !== b.costBreakdown.total.amountMinor)
    return a.costBreakdown.total.amountMinor - b.costBreakdown.total.amountMinor;
  return a.family.localeCompare(b.family);
}

function enumerateSpecs(req: NormalizedRequest): CandidateSpec[] {
  const specs: CandidateSpec[] = [];
  const optional = req.optionalCities.map((c) => cityInfo(c.city)).slice(0, 2);
  const nights = Array.from({ length: MAX_STOP_NIGHTS }, (_, i) => i + 1);

  if (optional.length > 0) {
    for (const style of STYLES) specs.push({ pattern: "event-focus", stopNights: 0, style, extraNights: 0 });
    for (const stop of optional)
      for (const pattern of ["pre-event-stop", "post-event-stop"] as const)
        for (const style of STYLES)
          for (const n of nights) specs.push({ pattern, stop, stopNights: n, style, extraNights: 0 });
  } else {
    for (const style of ["standard", "comfort"] as const) specs.push({ pattern: "event-focus", stopNights: 0, style, extraNights: 0 });
    specs.push({ pattern: "lean", stopNights: 0, style: "budget", extraNights: 0 });
    for (const style of STYLES) for (const extra of [1, 2]) specs.push({ pattern: "early-arrival", stopNights: 0, style, extraNights: extra });
  }
  return specs;
}

export type PlanResult = {
  /** Up to three candidates in final rank order (exactly three unless the request is impossible). */
  chosen: Candidate[];
  /** Why no candidate satisfied the hard constraints, if none did. */
  blockingReasons: string[];
};

export function plan(req: NormalizedRequest, est: Estimator = heuristicEstimator): PlanResult {
  const all = enumerateSpecs(req).map((s) => buildCandidate(req, s, est));
  const valid = all.filter((c) => c.feasibility.hardConstraintsSatisfied);
  if (valid.length === 0) {
    const reasons = Array.from(new Set(all.flatMap((c) => c.feasibility.warnings.filter((w) => !w.startsWith("Over budget") && !w.startsWith("Tight") && !w.includes("long flight")))));
    return { chosen: [], blockingReasons: reasons.slice(0, 4) };
  }

  // Best candidate per family.
  const bestByFamily = new Map<string, Candidate>();
  for (const c of [...valid].sort(compareCandidates)) if (!bestByFamily.has(c.family)) bestByFamily.set(c.family, c);
  const families = [...bestByFamily.values()].sort(compareCandidates);

  // Always keep the stop-free option as a fallback, then add the best distinct families.
  const chosen: Candidate[] = [];
  const anchor = families.find((c) => c.pattern === "event-focus");
  if (anchor) chosen.push(anchor);
  for (const c of families) {
    if (chosen.length >= 3) break;
    if (chosen.includes(c)) continue;
    // Prefer covering a different optional city / position before repeating one.
    const sameCity = chosen.some((x) => x.spec.stop && c.spec.stop && x.spec.stop.city === c.spec.stop.city);
    const otherCityLeft = families.some((f) => !chosen.includes(f) && f !== c && f.spec.stop && !chosen.some((x) => x.spec.stop?.city === f.spec.stop!.city));
    if (sameCity && otherCityLeft && chosen.length === 2) continue;
    chosen.push(c);
  }
  // Fill with runner-up variants (different lodging style) if families ran out.
  if (chosen.length < 3) {
    for (const c of [...valid].sort(compareCandidates)) {
      if (chosen.length >= 3) break;
      if (chosen.some((x) => x.family === c.family && x.spec.style === c.spec.style)) continue;
      chosen.push(c);
    }
  }
  return { chosen: chosen.sort(compareCandidates).slice(0, 3), blockingReasons: [] };
}

/** Deterministic "why this option" bullets, using only computed facts. */
export function explain(c: Candidate, best: Candidate, req: NormalizedRequest): { summary: string; highlights: string[] } {
  const seq = c.citySequence
    .slice(1, -1)
    .map((s) => `${s.city} (${diffDays(s.arrivalDate, s.departureDate)}n)`)
    .join(" → ");
  const route = `${req.origin.city} → ${seq} → ${req.origin.city}`;
  const { total, remaining } = c.costBreakdown;
  const budgetLine = remaining.amountMinor >= 0
    ? `${formatMoney(remaining)} under budget`
    : `${formatMoney(money(-remaining.amountMinor, remaining.currency))} over budget`;
  const summary = `${route} · ${formatMoney(total)} estimated, ${budgetLine}.`;

  const highlights: string[] = [];
  highlights.push(`${req.event.name} locked: in ${req.event.city} for every day ${formatShort(req.event.startDate)}–${formatShort(req.event.endDate)}.`);
  if (c.spec.stop) highlights.push(`Adds ${c.spec.stop.city} for ${c.spec.stopNights} night${c.spec.stopNights === 1 ? "" : "s"} ${c.pattern === "pre-event-stop" ? "before" : "after"} the event.`);
  else if (req.optionalCities.length > 0) highlights.push(`Skips optional cities to keep cost and travel time down.`);
  highlights.push(`About ${Math.round(c.travelMinutes / 60)}h of flying across ${c.legs.length} flights; ${c.spec.style} lodging.`);
  if (c !== best) {
    const delta = c.costBreakdown.total.amountMinor - best.costBreakdown.total.amountMinor;
    const sign = delta >= 0 ? "+" : "−";
    highlights.push(`${sign}${formatMoney(money(Math.abs(delta), total.currency))} vs the top-ranked option.`);
  }
  highlights.push(c.feasibility.withinBudget ? `Within your ${formatMoney(req.budget)} budget.` : `Exceeds your ${formatMoney(req.budget)} budget — shown so you can compare.`);
  return { summary, highlights };
}
