/**
 * EventHopper shared API contract — v1.
 *
 * Shared between backend (route handlers in src/app/api, logic in src/server)
 * and frontend. Change field names, nullability or status values only after
 * both owners agree, and bump CONTRACT_VERSION.
 */
import { z } from "zod";

export const CONTRACT_VERSION = "1.4.0";

// ---------- Primitive types ----------

/** Integer minor units (TRY → kuruş). Never sum formatted strings. */
export type Money = { amountMinor: number; currency: string };

export type EstimateSource = "mock" | "heuristic" | "provider";
export type LodgingStyle = "budget" | "standard" | "comfort";
export type Pace = "relaxed" | "balanced" | "fast";
export type TransportMode = "flight" | "rail" | "bus" | "ferry" | "unknown";

export type CityRef = { city: string; countryCode?: string; iataCode?: string };

/** Where a provider-priced line item came from. Present only when estimateSource is "provider". */
export type PriceSource = {
  provider: "serpapi";
  product: "google_flights" | "google_hotels";
  /** When this server fetched it. Upstream results may be cached by the provider. */
  fetchedAt: string;
  /** True when served from this server's cache instead of a new provider call. */
  fromCache: boolean;
  /**
   * "live": fetched from the provider during this session. "replay": a recorded
   * observation saved earlier — show observedAt and never present it as current.
   */
  retrieval?: "live" | "replay";
  /** When the provider returned this result (original time for replays). */
  observedAt?: string;
  /** Human-readable offer description, e.g. "Turkish Airlines TK54, nonstop" or a hotel name. */
  description: string;
  /** Public search page (never an offer/booking link). */
  searchUrl?: string;
  /** Extra caveats, e.g. "stay total derived from nightly rate × nights". */
  notes?: string[];
};

// ---------- Request side ----------

export type NormalizedRequest = {
  origin: CityRef;
  event: {
    name: string;
    city: string;
    countryCode?: string;
    startDate: string; // YYYY-MM-DD, inclusive
    endDate: string; // YYYY-MM-DD, inclusive
    hardConstraint: true;
    sourceUrl?: string;
  };
  /** startDate: earliest departure from origin. endDate: latest arrival back at origin. */
  travelWindow: { startDate: string; endDate: string };
  budget: Money;
  optionalCities: Array<{ city: string; countryCode?: string }>;
  preferences: {
    maxStops?: number;
    preferredPace?: Pace;
    lodgingStyle?: LodgingStyle;
  };
};

const isoDate = z.iso.date();
const moneySchema = z.object({ amountMinor: z.number().int().safe(), currency: z.literal("TRY") });
const lodgingStyleSchema = z.enum(["budget", "standard", "comfort"]);

/** Full validation for a NormalizedRequest echoed back by a client (fallback after a server restart). */
export const normalizedRequestSchema = z.object({
  origin: z.object({ city: z.string().min(1).max(60), countryCode: z.string().max(3).optional(), iataCode: z.string().max(4).optional() }),
  event: z.object({
    name: z.string().min(1).max(120),
    city: z.string().min(1).max(60),
    countryCode: z.string().max(3).optional(),
    startDate: isoDate,
    endDate: isoDate,
    hardConstraint: z.literal(true),
    sourceUrl: z
      .url()
      .max(300)
      .refine((value) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      }, "Event source URL must use HTTPS.")
      .optional(),
  }),
  travelWindow: z.object({ startDate: isoDate, endDate: isoDate }),
  budget: moneySchema.extend({ amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
  optionalCities: z.array(z.object({ city: z.string().min(1).max(60), countryCode: z.string().max(3).optional() })).max(2),
  preferences: z.object({
    maxStops: z.number().int().min(0).max(3).optional(),
    preferredPace: z.enum(["relaxed", "balanced", "fast"]).optional(),
    lodgingStyle: lodgingStyleSchema.optional(),
  }),
}) satisfies z.ZodType<NormalizedRequest>;

/** Partial overrides a form or a reoptimization can apply on top of parsed text. */
export const requestOverridesSchema = z
  .object({
    origin: z.object({ city: z.string().min(1).max(60) }).optional(),
    event: z
      .object({
        name: z.string().min(1).max(120).optional(),
        city: z.string().min(1).max(60).optional(),
        startDate: z.iso.date().optional(),
        endDate: z.iso.date().optional(),
      })
      .optional(),
    travelWindow: z
      .object({ startDate: z.iso.date().optional(), endDate: z.iso.date().optional() })
      .optional(),
    budget: z
      .object({
        amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        /** Non-TRY budgets are converted to TRY with dated reference rates (see TripResponse.fx). */
        currency: z.enum(["TRY", "EUR", "USD", "GBP"]),
      })
      .optional(),
    optionalCities: z.array(z.object({ city: z.string().min(1).max(60) })).max(2).optional(),
    preferences: z
      .object({
        maxStops: z.number().int().min(0).max(3).optional(),
        preferredPace: z.enum(["relaxed", "balanced", "fast"]).optional(),
        lodgingStyle: z.enum(["budget", "standard", "comfort"]).optional(),
      })
      .optional(),
  })
  .strict();

export type RequestOverrides = z.infer<typeof requestOverridesSchema>;

/** POST /api/trips/optimize */
export const optimizeBodySchema = z
  .object({
    text: z.string().max(2000).optional(),
    overrides: requestOverridesSchema.optional(),
  })
  .refine((b) => (b.text && b.text.trim().length > 0) || b.overrides, {
    message: "Provide `text`, `overrides`, or both.",
  });

export type OptimizeBody = z.infer<typeof optimizeBodySchema>;

/** POST /api/trips/{requestId}/reoptimize */
export const reoptimizeBodySchema = z.object({
  changes: requestOverridesSchema,
  /**
   * Optional copy of the previous normalizedRequest. Used when the server no
   * longer has requestId in memory (e.g. restart / serverless cold start).
   */
  baseRequest: normalizedRequestSchema.optional(),
  /** Latest version shown by the client; preserves monotonic versions after a restart. */
  baseRequirementsVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1).optional(),
});

export type ReoptimizeBody = z.infer<typeof reoptimizeBodySchema>;

/** POST /api/routes/{routeId}/hero */
export const heroBodySchema = z.object({
  /** Fallback route context when the server no longer has routeId in memory. */
  route: z
    .object({
      title: z.string().min(1).max(120),
      cities: z.array(z.string().min(1).max(60)).min(1).max(4),
      eventName: z.string().min(1).max(120),
    })
    .optional(),
});

// ---------- Response side ----------

export type CityStop = {
  city: string;
  countryCode?: string;
  arrivalDate: string;
  departureDate: string;
  purpose: "origin" | "stopover" | "event";
};

export type Leg = {
  fromCity: string;
  toCity: string;
  departureDate: string;
  /** Extension: local arrival date (overnight flights arrive the next day). */
  arrivalDate: string;
  mode: TransportMode;
  durationMinutes?: number;
  stops?: number;
  estimatedCost: Money;
  estimateSource: EstimateSource;
  source?: PriceSource;
};

export type Stay = {
  city: string;
  checkIn: string;
  checkOut: string; // exclusive
  nights: number;
  style: LodgingStyle;
  estimatedCost: Money;
  estimateSource: EstimateSource;
  source?: PriceSource;
};

export type CostBreakdown = {
  transport: Money;
  lodging: Money;
  localTransport: Money;
  foodAndActivities: Money;
  contingency: Money;
  total: Money;
  budget: Money;
  /** Negative when over budget. */
  remaining: Money;
};

export type HeroImage = {
  status: "not_requested" | "queued" | "ready" | "failed";
  url?: string;
  error?: string;
};

export type RouteOption = {
  id: string;
  label: "A" | "B" | "C";
  title: string;
  summary: string;
  /** Extension: deterministic "why this option" bullet points. */
  highlights: string[];
  /** Extension: "event-focus" | "pre-event-stop" | "post-event-stop" | ... */
  pattern: string;
  citySequence: CityStop[];
  event: { name: string; city: string; startDate: string; endDate: string; locked: true };
  legs: Leg[];
  stays: Stay[];
  costBreakdown: CostBreakdown;
  feasibility: {
    /** hardConstraintsSatisfied && withinBudget */
    feasible: boolean;
    withinBudget: boolean;
    hardConstraintsSatisfied: boolean;
    warnings: string[];
  };
  score: { total: number; budgetFit: number; travelEfficiency: number; preferenceFit: number };
  assumptions: string[];
  heroImage?: HeroImage;
  /** How this option differs from the baseline (recommended, else top-ranked) option. */
  comparison?: OptionComparison;
  /** Total converted to other currencies for display only (see TripResponse.fx). */
  convertedTotals?: Money[];
  /** Optional decorative places; never part of feasibility, prices or ranking. */
  nearbyPlaces?: NearbyCityPlaces[];
};

export type OptionComparison = {
  baselineOptionId: string;
  isBaseline: boolean;
  /** This option minus the baseline. Negative money = cheaper; negative minutes = less flying. */
  delta: {
    total: Money;
    transport: Money;
    lodging: Money;
    nights: number;
    flights: number;
    connections: number;
    travelMinutes: number;
  };
  /** Cities this option visits that the baseline does not, and vice versa. */
  addedCities: string[];
  droppedCities: string[];
  /** False when the two options are priced from different sources, so money deltas are indicative only. */
  comparablePricing: boolean;
  /** e.g. "4,000 TRY cheaper · 1 more flight · 1 night less · adds Bangkok". Empty for the baseline. */
  summary: string;
};

/** Display-only exchange rates (never used for budget checks unless stated in assumptions). */
export type FxInfo = {
  base: string;
  /** quote currency → units of quote per 1 unit of base */
  rates: Record<string, number>;
  /** Reference date of the rates (provider publication date). */
  date: string;
  source: "frankfurter";
  note: string;
};

export type TripResponse = {
  requestId: string;
  generatedAt: string;
  contractVersion: string;
  /** Extension: increments on every reoptimization; ignore responses older than the latest. */
  requirementsVersion: number;
  previousRequestId?: string;
  status: "ready" | "needs_input";
  /** Present when status is "ready"; best-effort partial values when "needs_input". */
  normalizedRequest: NormalizedRequest | null;
  clarificationQuestions: string[];
  /** Global assumptions applied to every option (mock pricing, buffers, defaults). */
  assumptions: string[];
  /** Exactly three when status is "ready"; empty when "needs_input". */
  options: RouteOption[];
  /** Id of the highest-scoring option with feasibility.feasible, or null if none. */
  recommendedOptionId: string | null;
  /** How the totals were priced. */
  pricing: PricingSummary;
  /** Reference exchange rates used for convertedTotals (and for a foreign-currency budget, if any). */
  fx?: FxInfo;
  /** How free text was interpreted; no model-generated route or prices. */
  interpretation?: InterpretationInfo;
};

export type PricingSummary = {
  /** "estimates": heuristic/mock only. "mixed": some provider prices. "provider": every leg and stay provider-priced. */
  mode: "estimates" | "mixed" | "provider";
  checkedAt?: string;
  /** New provider calls made for this response. */
  providerCalls: number;
  /** Provider lookups answered from this server's cache. */
  cacheHits: number;
  notes: string[];
  /** "replay" when provider lines come from recorded observations instead of live searches. */
  retrieval?: "live" | "replay";
};

export type ApiError = {
  error: {
    code:
      | "invalid_body"
      | "request_not_found"
      | "route_not_found"
      | "hero_disabled"
      | "hero_limit_reached"
      | "hero_failed"
      | "rate_limited"
      | "provider_unavailable"
      | "internal";
    message: string;
    details?: unknown;
  };
};

export type HeroResponse = { routeId: string; heroImage: HeroImage; cached: boolean };

// ---------- Live price check & guest price quotes ----------

/** POST /api/trips/{requestId}/price-check */
export const priceCheckBodySchema = z.object({
  /** Previous normalizedRequest, used when the server no longer has requestId in memory. */
  baseRequest: normalizedRequestSchema.optional(),
  /** Latest version shown by the client; preserves monotonic versions after a restart. */
  baseRequirementsVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1).optional(),
});

const city = z.string().min(1).max(60);

/** POST /api/prices/quote — a single flight or hotel price, no trip needed. */
export const quoteBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("flight"), from: city, to: city, date: z.iso.date() }),
  z.object({
    kind: z.literal("hotel"),
    city,
    checkIn: z.iso.date(),
    checkOut: z.iso.date(),
    style: z.enum(["budget", "standard", "comfort"]).default("standard"),
  }),
]);

export type QuoteBody = z.input<typeof quoteBodySchema>;

export type QuoteOffer = {
  price: Money;
  description: string;
  /** Flights only. */
  departureDate?: string;
  arrivalDate?: string;
  durationMinutes?: number;
  stops?: number;
  /** Hotels only: true when the stay total was derived from a nightly rate. */
  totalDerived?: boolean;
};

export type QuoteResponse = {
  kind: "flight" | "hotel";
  query: { from?: string; to?: string; date?: string; city?: string; checkIn?: string; checkOut?: string; nights?: number; style?: LodgingStyle };
  /** Always present so the user can compare. */
  estimate: { price: Money; estimateSource: "heuristic" | "mock" };
  provider:
    | { status: "ok"; offers: QuoteOffer[]; fetchedAt: string; fromCache: boolean; searchUrl?: string; retrieval?: "live" | "replay"; observedAt?: string }
    | { status: "unavailable"; reason: ProviderFailure; message: string };
  scope: string;
};

export type ProviderFailure = "not_configured" | "quota" | "auth" | "timeout" | "empty" | "currency" | "error";

/** GET /api/session */
export type SessionResponse = {
  guest: { id: string; isNew: boolean };
  /** livePrices is true for live, record and replay modes; priceMode says which. */
  features: { livePrices: boolean; banners: boolean; priceMode?: "live" | "record" | "replay" | "off"; eventSearch?: boolean; eventImport?: boolean; aiParsing?: boolean; nearbyPlaces?: boolean };
  limits: Record<"priceCheck" | "quote" | "hero", { remaining: number; max: number; windowMinutes: number }>
    & Partial<Record<"eventSearch" | "interpret" | "nearby", { remaining: number; max: number; windowMinutes: number }>>;
  cities: Array<{ city: string; countryCode: string; iataCode: string }>;
};

// ---------- Weather (decorative context; never affects planning) ----------

/** GET /api/weather?city=Singapore&start=2026-10-26&end=2026-10-30 */
export const weatherQuerySchema = z.object({
  city: z.string().min(1).max(60),
  start: z.iso.date(),
  end: z.iso.date(),
});

export type WeatherDay = {
  date: string;
  /** "beyond_forecast": the date is past the provider's forecast horizon (about 16 days). */
  status: "forecast" | "beyond_forecast" | "unavailable";
  tempMaxC?: number;
  tempMinC?: number;
  precipitationProbabilityMax?: number;
  precipitationMm?: number;
  weatherCode?: number;
  /** Plain-language WMO code description, e.g. "Slight rain showers". */
  summary?: string;
};

export type WeatherResponse = {
  city: string;
  days: WeatherDay[];
  source: "open-meteo";
  fetchedAt?: string;
  /** Last date the provider can forecast today. */
  forecastHorizon: string;
  attribution: string;
  note: string;
};

// ---------- Event search & import ----------

/** GET /api/events/search?q=SWITCH&city=Singapore */
export const eventSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  city: z.string().trim().min(1).max(60).optional(),
});

/** POST /api/events/import — one Eventbrite event by link or numeric id. */
export const eventImportBodySchema = z.object({
  url: z.string().trim().min(1).max(500),
});

export type EventSource = "catalog" | "google_events" | "ticketmaster" | "eventbrite" | "web";

export type EventCandidate = {
  /** Source-scoped id, e.g. "ticketmaster:G5v..." */
  id: string;
  source: EventSource;
  name: string;
  /** City as the source reports it. */
  city?: string;
  /** Matching city in our estimate catalog; absent when the trip cannot be planned yet. */
  catalogCity?: string;
  countryCode?: string;
  venue?: string;
  description?: string;
  dateText?: string;
  observedAt?: string;
  fromCache?: boolean;
  priceNote?: string;
  /** Local calendar dates (inclusive). Missing when the source did not give a parseable date. */
  startDate?: string;
  endDate?: string;
  sourceUrl?: string;
  /** "verified": curated catalog. "listed": as the source lists it. "partial": some dates missing/guessed-free. */
  dateConfidence: "verified" | "listed" | "partial";
  /** True when city and both dates are known and the city is in the catalog. */
  plannable: boolean;
  warnings: string[];
  /**
   * Ready-to-send `overrides.event` for POST /api/trips/optimize. Only send it
   * after the user confirms the event; it becomes the locked hard constraint.
   */
  overrides?: { event: { name: string; city: string; startDate: string; endDate: string } };
};

export type EventSourceStatus = {
  source: EventSource;
  status: "ok" | "empty" | "not_configured" | "quota" | "error";
  message?: string;
};

export type EventSearchResponse = {
  query: { q: string; city?: string };
  results: EventCandidate[];
  sources: EventSourceStatus[];
  note: string;
};

export type EventImportResponse = { candidate: EventCandidate; sources: EventSourceStatus[] };


export type InterpretationInfo = {
  mode: "deterministic" | "openai";
  status: "disabled" | "used" | "fallback";
  model?: string;
  fromCache?: boolean;
  note: string;
  usage?: { inputTokens: number; outputTokens: number };
};

/** POST /api/routes/{routeId}/places. Fallback contains catalog cities only. */
export const nearbyPlacesBodySchema = z.object({
  route: z.object({ cities: z.array(z.string().trim().min(1).max(60)).min(1).max(2) }).strict().optional(),
}).strict();
export type NearbyPlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  categories: string[];
  distanceMeters: number;
  address?: string;
  website?: string;
};
export type NearbyCityPlaces = {
  city: string;
  status: "ok" | "not_configured" | "quota" | "unavailable";
  places: NearbyPlace[];
  /** Catalog city centre, not the user's venue/hotel location. */
  centre: { latitude: number; longitude: number };
  radiusMeters: number;
  fetchedAt?: string;
  fromCache: boolean;
  note: string;
};
export type NearbyPlacesResponse = {
  routeId: string;
  source: "geoapify";
  cities: NearbyCityPlaces[];
  providerCalls: number;
  attribution: string;
  note: string;
};

export const recommendEventsBodySchema = z.object({
  brief: z.string().trim().min(2).max(2000),
  route: z.object({
    cities: z.array(z.object({ city: z.string().min(1).max(60), arrivalDate: isoDate, departureDate: isoDate })).min(1).max(2),
    event: z.object({ name: z.string().min(1).max(120), city: z.string().min(1).max(60), startDate: isoDate, endDate: isoDate }),
  }),
});
export type EventInterest = { label: string; quote: string; query: string; keywords: string[] };
export type RecommendedEvent = { event: EventCandidate; matchedInterests: string[]; evidence: string[]; matchReason: string; timing: "during-visit" | "dates-unconfirmed"; eventDayConflict: boolean };
export type EventRecommendationsResponse = { routeId: string; interests: EventInterest[]; recommendations: RecommendedEvent[]; sources: EventSourceStatus[]; providerCalls: number; interpretation: "openai" | "unavailable"; notes: string[] };
