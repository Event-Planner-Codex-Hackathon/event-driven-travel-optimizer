/**
 * Trip service: text/overrides → NormalizedRequest → plan → TripResponse.
 * Reoptimization always reruns the whole planner on the modified request.
 */
import { randomUUID } from "node:crypto";
import {
  CONTRACT_VERSION,
  type NormalizedRequest,
  type RequestOverrides,
  type RouteOption,
  type TripResponse,
} from "@/contract/trip";
import { CITIES, PLANNING_RULES, findCity } from "./catalog";
import { addDays, formatShort, isValidDate } from "./dates";
import { formatMoney } from "./money";
import { parseRequestText, type ParsedRequest } from "./parser";
import { explain, plan } from "./planner";
import { getTrip, saveTrip } from "./store";

const SUPPORTED = CITIES.map((c) => c.city).join(", ");

type Draft = {
  origin?: string;
  event: { name?: string; city?: string; startDate?: string; endDate?: string; sourceUrl?: string };
  travelWindow: { startDate?: string; endDate?: string };
  budget?: { amountMinor: number; currency: string };
  optionalCities: string[];
  preferences: NormalizedRequest["preferences"];
};

function draftFromParsed(p: ParsedRequest): Draft {
  return {
    origin: p.originCity,
    event: { ...p.event },
    travelWindow: { ...p.travelWindow },
    budget: p.budget,
    optionalCities: [...p.optionalCities],
    preferences: { ...p.preferences },
  };
}

function draftFromRequest(r: NormalizedRequest): Draft {
  return {
    origin: r.origin.city,
    event: { name: r.event.name, city: r.event.city, startDate: r.event.startDate, endDate: r.event.endDate, sourceUrl: r.event.sourceUrl },
    travelWindow: { ...r.travelWindow },
    budget: { ...r.budget },
    optionalCities: r.optionalCities.map((c) => c.city),
    preferences: { ...r.preferences },
  };
}

function applyOverrides(d: Draft, o: RequestOverrides | undefined): Draft {
  if (!o) return d;
  return {
    origin: o.origin?.city ?? d.origin,
    event: { ...d.event, ...o.event },
    travelWindow: { ...d.travelWindow, ...o.travelWindow },
    budget: o.budget ?? d.budget,
    optionalCities: o.optionalCities ? o.optionalCities.map((c) => c.city) : d.optionalCities,
    preferences: { ...d.preferences, ...o.preferences },
  };
}

/** Validate a draft. Returns either a complete request or clarification questions. */
function finalize(d: Draft, issues: string[], assumptions: string[]): { request: NormalizedRequest | null; questions: string[] } {
  const questions = [...issues];
  const origin = d.origin ? findCity(d.origin) : undefined;
  const eventCity = d.event.city ? findCity(d.event.city) : undefined;

  if (!d.origin) questions.push("Where are you leaving from?");
  else if (!origin) questions.push(`We don't have estimates for "${d.origin}" yet. Supported cities: ${SUPPORTED}.`);
  if (!d.event.city) questions.push("Which city is the event in?");
  else if (!eventCity) questions.push(`We don't have estimates for "${d.event.city}" yet. Supported cities: ${SUPPORTED}.`);
  if (!d.event.startDate || !d.event.endDate) questions.push("What are the event's first and last days (e.g. October 27–29)?");
  else if (!isValidDate(d.event.startDate) || !isValidDate(d.event.endDate) || d.event.endDate < d.event.startDate)
    questions.push("The event dates look invalid. What are the first and last event days?");
  if (!d.budget && !issues.some((i) => i.includes("TRY"))) questions.push("What is your total budget in TRY?");
  if (origin && eventCity && origin.city === eventCity.city) questions.push("The event is in your departure city. Where are you travelling from?");

  const optional: string[] = [];
  for (const name of d.optionalCities) {
    const c = findCity(name);
    if (!c) questions.push(`We don't have estimates for optional city "${name}" yet. Supported cities: ${SUPPORTED}.`);
    else if (c.city !== origin?.city && c.city !== eventCity?.city && !optional.includes(c.city)) optional.push(c.city);
  }

  if (questions.length > 0 || !origin || !eventCity || !d.budget || !d.event.startDate || !d.event.endDate) {
    return { request: null, questions };
  }

  const window = { ...d.travelWindow };
  if (!window.startDate) {
    window.startDate = addDays(d.event.startDate, -PLANNING_RULES.defaultDaysBeforeEvent);
    assumptions.push(`No departure date given: earliest departure set to ${formatShort(window.startDate)}.`);
  }
  if (!window.endDate) {
    window.endDate = addDays(d.event.endDate, PLANNING_RULES.defaultDaysAfterEvent);
    assumptions.push(`No return date given: back in ${origin.city} by ${formatShort(window.endDate)}.`);
  }

  return {
    questions: [],
    request: {
      origin: { city: origin.city, countryCode: origin.countryCode, iataCode: origin.iataCode },
      event: {
        name: d.event.name ?? `Event in ${eventCity.city}`,
        city: eventCity.city,
        countryCode: eventCity.countryCode,
        startDate: d.event.startDate,
        endDate: d.event.endDate,
        hardConstraint: true,
        ...(d.event.sourceUrl ? { sourceUrl: d.event.sourceUrl } : {}),
      },
      travelWindow: { startDate: window.startDate, endDate: window.endDate },
      budget: d.budget,
      optionalCities: optional.slice(0, 2).map((city) => ({ city, countryCode: findCity(city)!.countryCode })),
      preferences: d.preferences,
    },
  };
}

function globalAssumptions(req: NormalizedRequest): string[] {
  return [
    "Demo estimates: all prices are heuristic or mock planning figures in TRY — not live fares, hotel inventory or bookable quotes.",
    "1 adult, economy class, 1 room.",
    `Event lock: arrive in ${req.event.city} by ${formatShort(addDays(req.event.startDate, -PLANNING_RULES.arrivalBufferDays))} and leave no earlier than ${formatShort(addDays(req.event.endDate, PLANNING_RULES.departureBufferDays))}.`,
    "Flights over ~5,000 km are modeled as overnight (arrive the next local day).",
    `A ${PLANNING_RULES.contingencyRate * 100}% contingency is added to every total.`,
  ];
}

function buildResponse(
  request: NormalizedRequest | null,
  questions: string[],
  assumptions: string[],
  meta: { requirementsVersion: number; previousRequestId?: string },
): TripResponse {
  const requestId = `trp_${randomUUID().slice(0, 12)}`;
  const base = {
    requestId,
    generatedAt: new Date().toISOString(),
    contractVersion: CONTRACT_VERSION,
    requirementsVersion: meta.requirementsVersion,
    ...(meta.previousRequestId ? { previousRequestId: meta.previousRequestId } : {}),
  };

  if (!request) {
    return { ...base, status: "needs_input", normalizedRequest: null, clarificationQuestions: questions, assumptions, options: [], recommendedOptionId: null };
  }

  const { chosen, blockingReasons } = plan(request);
  if (chosen.length < 3) {
    const why = blockingReasons.length ? ` ${blockingReasons.join(" ")}` : "";
    return {
      ...base,
      status: "needs_input",
      normalizedRequest: request,
      clarificationQuestions: [
        `No route can keep you in ${request.event.city} for every event day within your travel window (${formatShort(request.travelWindow.startDate)}–${formatShort(request.travelWindow.endDate)}).${why} Can you widen the travel window?`,
      ],
      assumptions: [...globalAssumptions(request), ...assumptions],
      options: [],
      recommendedOptionId: null,
    };
  }

  const labels = ["A", "B", "C"] as const;
  const best = chosen[0];
  const options: RouteOption[] = chosen.map((c, i) => {
    const { summary, highlights } = explain(c, best, request);
    const { family: _f, spec: _s, travelMinutes: _t, ...rest } = c;
    return { ...rest, id: `${requestId}-${labels[i]}`, label: labels[i], summary, highlights };
  });
  const recommended = options.find((o) => o.feasibility.feasible);

  const allAssumptions = [...globalAssumptions(request), ...assumptions];
  if (!recommended) {
    const cheapest = [...options].sort((a, b) => a.costBreakdown.total.amountMinor - b.costBreakdown.total.amountMinor)[0];
    allAssumptions.push(
      `No option fits the ${formatMoney(request.budget)} budget; the cheapest keeps the event and costs ${formatMoney(cheapest.costBreakdown.total)}.`,
    );
  }

  const response: TripResponse = {
    ...base,
    status: "ready",
    normalizedRequest: request,
    clarificationQuestions: [],
    assumptions: allAssumptions,
    options,
    recommendedOptionId: recommended?.id ?? null,
  };
  return response;
}

export function optimizeTrip(input: { text?: string; overrides?: RequestOverrides }, today: string = new Date().toISOString().slice(0, 10)): TripResponse {
  const parsed = input.text?.trim()
    ? parseRequestText(input.text, today)
    : { optionalCities: [], preferences: {}, assumptions: [], issues: [], event: {} } as ParsedRequest;
  const draft = applyOverrides(draftFromParsed(parsed), input.overrides);
  const assumptions = [...parsed.assumptions];
  const { request, questions } = finalize(draft, parsed.issues, assumptions);
  const response = buildResponse(request, questions, assumptions, { requirementsVersion: 1 });
  saveTrip(response);
  return response;
}

export type ReoptimizeResult = { ok: true; response: TripResponse } | { ok: false; code: "request_not_found"; message: string };

export function reoptimizeTrip(requestId: string, changes: RequestOverrides, baseRequest?: NormalizedRequest): ReoptimizeResult {
  const previous = getTrip(requestId);
  const prevRequest = previous?.normalizedRequest ?? baseRequest;
  if (!prevRequest) {
    return { ok: false, code: "request_not_found", message: `Unknown requestId ${requestId}. Send baseRequest or call /api/trips/optimize again.` };
  }
  const draft = applyOverrides(draftFromRequest(prevRequest), changes);
  const assumptions: string[] = [];
  const { request, questions } = finalize(draft, [], assumptions);
  const response = buildResponse(request, questions, assumptions, {
    requirementsVersion: (previous?.requirementsVersion ?? 1) + 1,
    previousRequestId: requestId,
  });
  saveTrip(response);
  return { ok: true, response };
}
