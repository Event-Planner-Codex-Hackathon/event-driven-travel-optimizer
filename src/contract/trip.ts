/**
 * EventHopper shared API contract — v1.
 *
 * Shared between backend (route handlers in src/app/api, logic in src/server)
 * and frontend. Change field names, nullability or status values only after
 * both owners agree, and bump CONTRACT_VERSION.
 */
import { z } from "zod";

export const CONTRACT_VERSION = "1.0.0";

// ---------- Primitive types ----------

/** Integer minor units (TRY → kuruş). Never sum formatted strings. */
export type Money = { amountMinor: number; currency: string };

export type EstimateSource = "mock" | "heuristic" | "provider";
export type LodgingStyle = "budget" | "standard" | "comfort";
export type Pace = "relaxed" | "balanced" | "fast";
export type TransportMode = "flight" | "rail" | "bus" | "ferry" | "unknown";

export type CityRef = { city: string; countryCode?: string; iataCode?: string };

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

/** Partial overrides a form or a reoptimization can apply on top of parsed text. */
export const requestOverridesSchema = z
  .object({
    origin: z.object({ city: z.string().min(1) }).optional(),
    event: z
      .object({
        name: z.string().min(1).optional(),
        city: z.string().min(1).optional(),
        startDate: z.iso.date().optional(),
        endDate: z.iso.date().optional(),
      })
      .optional(),
    travelWindow: z
      .object({ startDate: z.iso.date().optional(), endDate: z.iso.date().optional() })
      .optional(),
    budget: z
      .object({
        amountMinor: z.number().int().positive(),
        currency: z.string().length(3),
      })
      .optional(),
    optionalCities: z.array(z.object({ city: z.string().min(1) })).max(2).optional(),
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
  baseRequest: z.unknown().optional(),
});

export type ReoptimizeBody = z.infer<typeof reoptimizeBodySchema>;

/** POST /api/routes/{routeId}/hero */
export const heroBodySchema = z.object({
  /** Fallback route context when the server no longer has routeId in memory. */
  route: z
    .object({
      title: z.string(),
      cities: z.array(z.string()).min(1),
      eventName: z.string(),
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
};

export type Stay = {
  city: string;
  checkIn: string;
  checkOut: string; // exclusive
  nights: number;
  style: LodgingStyle;
  estimatedCost: Money;
  estimateSource: EstimateSource;
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
      | "internal";
    message: string;
    details?: unknown;
  };
};

export type HeroResponse = { routeId: string; heroImage: HeroImage; cached: boolean };
