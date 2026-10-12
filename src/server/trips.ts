/**
 * Trip service: text/overrides → NormalizedRequest → plan → TripResponse.
 * Reoptimization always reruns the whole planner on the modified request.
 */
import { randomUUID } from "node:crypto";
import {
  CONTRACT_VERSION,
  type FxInfo,
  type NormalizedRequest,
  type PricingSummary,
  type RequestOverrides,
  type RouteOption,
  type TripResponse,
} from "@/contract/trip";
import { CITIES, PLANNING_RULES, findCity } from "./catalog";
import { addDays, formatShort, isValidDate, todayLocal } from "./dates";
import { formatMoney } from "./money";
import { parseRequestText, type ParsedRequest } from "./parser";
import { compareCandidates, explain, plan, type Candidate } from "./planner";
import { withComparisons } from "./comparison";
import { FX_QUOTES } from "./providers/fx";
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
/** Convert a foreign-currency budget to TRY with dated reference rates, recording the conversion. */
function budgetInTry(budget: Draft["budget"], fx: FxInfo | null | undefined, assumptions: string[], questions: string[]): Draft["budget"] {
  if (!budget || budget.currency === "TRY") return budget;
  if (!(FX_QUOTES as readonly string[]).includes(budget.currency)) {
    questions.push("Budgets can be given in TRY, EUR, USD or GBP. What is your total budget in TRY?");
    return undefined;
  }
  const rate = fx?.rates[budget.currency];
  if (!rate) {
    questions.push(`We couldn't get a ${budget.currency} exchange rate right now. What is your total budget in TRY?`);
    return undefined;
  }
  const amountMinor = Math.round(budget.amountMinor / rate);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return budget;
  const converted = { amountMinor, currency: "TRY" };
  assumptions.push(
    `Budget of ${formatMoney(budget)} converted to ${formatMoney(converted)} at 1 TRY = ${rate} ${budget.currency} (Frankfurter reference rate, ${fx!.date}).`,
  );
  return converted;
}

function finalize(d: Draft, issues: string[], assumptions: string[], fx?: FxInfo | null): { request: NormalizedRequest | null; questions: string[] } {
  const questions = [...issues];
  d = { ...d, budget: budgetInTry(d.budget, fx, assumptions, questions) };
  const origin = d.origin ? findCity(d.origin) : undefined;
  const eventCity = d.event.city ? findCity(d.event.city) : undefined;

  if (!d.origin) questions.push("Where are you leaving from?");
  else if (!origin) questions.push(`We don't have estimates for "${d.origin}" yet. Supported cities: ${SUPPORTED}.`);
  if (!d.event.city) questions.push("Which city is the event in?");
  else if (!eventCity) questions.push(`We don't have estimates for "${d.event.city}" yet. Supported cities: ${SUPPORTED}.`);
  if (!d.event.startDate || !d.event.endDate) questions.push("What are the event's first and last days (e.g. October 27–29)?");
  else if (!isValidDate(d.event.startDate) || !isValidDate(d.event.endDate) || d.event.endDate < d.event.startDate)
    questions.push("The event dates look invalid. What are the first and last event days?");
  if (!d.budget && !questions.some((i) => i.includes("TRY"))) questions.push("What is your total budget in TRY?");
  else if (d.budget && (d.budget.currency !== "TRY" || !Number.isSafeInteger(d.budget.amountMinor) || d.budget.amountMinor <= 0))
    questions.push("This demo accepts positive budgets in TRY only. What is your total budget in TRY?");
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

const PRICING_ASSUMPTION: Record<PricingSummary["mode"], string> = {
  estimates: "Demo estimates: all prices are heuristic or mock planning figures in TRY — not live fares, hotel inventory or bookable quotes.",
  mixed: "Mixed pricing: lines marked provider are search results from Google Flights / Google Hotels; all other lines are heuristic or mock estimates. Not bookable quotes.",
  provider: "Flights and stays are search results from Google Flights / Google Hotels; food, local transport and contingency are estimates. Not bookable quotes.",
};

const REPLAY_ASSUMPTION =
  "Replay mode: provider-priced lines are recorded observations shown with their original date — not current prices.";

function globalAssumptions(req: NormalizedRequest, mode: PricingSummary["mode"] = "estimates"): string[] {
  return [
    PRICING_ASSUMPTION[mode],
    "1 adult, economy class, 1 room.",
    `Event lock: arrive in ${req.event.city} by ${formatShort(addDays(req.event.startDate, -PLANNING_RULES.arrivalBufferDays))} and leave no earlier than ${formatShort(addDays(req.event.endDate, PLANNING_RULES.departureBufferDays))}.`,
    "Flights over ~5,000 km are modeled as overnight (arrive the next local day).",
    `A ${PLANNING_RULES.contingencyRate * 100}% contingency is added to every total.`,
  ];
}

const ESTIMATES_ONLY: PricingSummary = {
  mode: "estimates",
  providerCalls: 0,
  cacheHits: 0,
  notes: ["All prices are planning estimates. Use a live price check to compare against provider prices."],
};

type ResponseMeta = { requirementsVersion: number; previousRequestId?: string };

function responseBase(meta: ResponseMeta) {
  const requestId = `trp_${randomUUID().slice(0, 12)}`;
  return {
    requestId,
    generatedAt: new Date().toISOString(),
    contractVersion: CONTRACT_VERSION,
    requirementsVersion: meta.requirementsVersion,
    ...(meta.previousRequestId ? { previousRequestId: meta.previousRequestId } : {}),
  };
}

/** Assumptions specific to this request (parser notes, defaults), without global or budget-status lines. */
export function requestAssumptions(trip: TripResponse): string[] {
  if (!trip.normalizedRequest) return [];
  const global = new Set([...Object.values(PRICING_ASSUMPTION), REPLAY_ASSUMPTION, ...globalAssumptions(trip.normalizedRequest)]);
  return trip.assumptions.filter((a) => !global.has(a) && !a.startsWith("No option fits"));
}

/** Rank candidates, label A/B/C, explain, and wrap them in a ready TripResponse. */
export function assembleReadyResponse(
  request: NormalizedRequest,
  candidates: Candidate[],
  assumptions: string[],
  meta: ResponseMeta,
  pricing: PricingSummary,
): TripResponse {
  const base = responseBase(meta);
  const ranked = [...candidates].sort(compareCandidates);
  const labels = ["A", "B", "C"] as const;
  const best = ranked[0];
  const ranked3: RouteOption[] = ranked.map((c, i) => {
    const { summary, highlights } = explain(c, best, request);
    const { family: _f, spec: _s, travelMinutes: _t, ...rest } = c;
    return { ...rest, id: `${base.requestId}-${labels[i]}`, label: labels[i], summary, highlights };
  });
  const recommended = ranked3.find((o) => o.feasibility.feasible);
  const options = withComparisons(ranked3, recommended?.id ?? null);

  const pricingLine = pricing.retrieval === "replay" ? [REPLAY_ASSUMPTION] : [];
  const allAssumptions = Array.from(new Set([...pricingLine, ...globalAssumptions(request, pricing.mode), ...assumptions]));
  if (!recommended) {
    const cheapest = [...options].sort((a, b) => a.costBreakdown.total.amountMinor - b.costBreakdown.total.amountMinor)[0];
    allAssumptions.push(
      `No option fits the ${formatMoney(request.budget)} budget; the cheapest keeps the event and costs ${formatMoney(cheapest.costBreakdown.total)}.`,
    );
  }

  return {
    ...base,
    status: "ready",
    normalizedRequest: request,
    clarificationQuestions: [],
    assumptions: allAssumptions,
    options,
    recommendedOptionId: recommended?.id ?? null,
    pricing,
  };
}

function buildResponse(
  request: NormalizedRequest | null,
  questions: string[],
  assumptions: string[],
  meta: ResponseMeta,
): TripResponse {
  if (!request) {
    return { ...responseBase(meta), status: "needs_input", normalizedRequest: null, clarificationQuestions: questions, assumptions, options: [], recommendedOptionId: null, pricing: ESTIMATES_ONLY };
  }

  const { chosen, blockingReasons } = plan(request);
  if (chosen.length < 3) {
    const why = blockingReasons.length ? ` ${blockingReasons.join(" ")}` : "";
    return {
      ...responseBase(meta),
      status: "needs_input",
      normalizedRequest: request,
      clarificationQuestions: [
        `No route can keep you in ${request.event.city} for every event day within your travel window (${formatShort(request.travelWindow.startDate)}–${formatShort(request.travelWindow.endDate)}).${why} Can you widen the travel window?`,
      ],
      assumptions: [...globalAssumptions(request), ...assumptions],
      options: [],
      recommendedOptionId: null,
      pricing: ESTIMATES_ONLY,
    };
  }
  return assembleReadyResponse(request, chosen, assumptions, meta, ESTIMATES_ONLY);
}

/** Add display-only converted totals and the rates used. No-op without rates. */
export function attachFx(response: TripResponse, fx: FxInfo | null | undefined): TripResponse {
  if (!fx) return response;
  return {
    ...response,
    fx,
    options: response.options.map((o) => ({
      ...o,
      convertedTotals: Object.entries(fx.rates).map(([currency, rate]) => ({
        amountMinor: Math.round(o.costBreakdown.total.amountMinor * rate),
        currency,
      })),
    })),
  };
}

export function optimizeTrip(
  input: { text?: string; overrides?: RequestOverrides },
  today: string = todayLocal(),
  fx?: FxInfo | null,
): TripResponse {
  const parsed = input.text?.trim()
    ? parseRequestText(input.text, today)
    : { optionalCities: [], preferences: {}, assumptions: [], issues: [], event: {} } as ParsedRequest;
  const draft = applyOverrides(draftFromParsed(parsed), input.overrides);
  const assumptions = [...parsed.assumptions];
  const { request, questions } = finalize(draft, parsed.issues, assumptions, fx);
  const response = attachFx(buildResponse(request, questions, assumptions, { requirementsVersion: 1 }), fx);
  saveTrip(response);
  return response;
}

export type ReoptimizeResult = { ok: true; response: TripResponse } | { ok: false; code: "request_not_found" | "invalid_body"; message: string };

export function reoptimizeTrip(requestId: string, changes: RequestOverrides, baseRequest?: NormalizedRequest, fx?: FxInfo | null, baseRequirementsVersion = 1): ReoptimizeResult {
  const previous = getTrip(requestId);
  const prevRequest = previous?.normalizedRequest ?? baseRequest;
  if (!prevRequest) {
    return { ok: false, code: "request_not_found", message: `Unknown requestId ${requestId}. Send baseRequest or call /api/trips/optimize again.` };
  }
  if (changes.event && Object.entries(changes.event).some(([key, value]) => value !== undefined && value !== prevRequest.event[key as keyof typeof changes.event])) {
    return { ok: false, code: "invalid_body", message: "The event is locked. Start a new trip to choose a different event, city or event dates." };
  }
  const draft = applyOverrides(draftFromRequest(prevRequest), changes);
  const assumptions = !changes.budget && previous ? requestAssumptions(previous).filter((a) => a.startsWith("Budget of ")) : [];
  const { request, questions } = finalize(draft, [], assumptions, fx);
  const response = attachFx(
    buildResponse(request, questions, assumptions, {
      requirementsVersion: (previous?.requirementsVersion ?? baseRequirementsVersion) + 1,
      previousRequestId: requestId,
    }),
    fx,
  );
  saveTrip(response);
  return { ok: true, response };
}
