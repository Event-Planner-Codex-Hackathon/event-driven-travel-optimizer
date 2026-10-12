import type { LodgingStyle, OptimizeBody } from "@/contract/trip";

// Pure helpers for the landing form: defaults, validation and the request body.

export const ORIGINS = ["Istanbul", "Ankara", "Izmir"] as const;
export type Origin = (typeof ORIGINS)[number];

export const PLACES = ["Bangkok", "Taipei", "Kuala Lumpur", "Hong Kong", "Tokyo", "Dubai"] as const;
export type Place = (typeof PLACES)[number];
export const MAX_PLACES = 2;

export const LODGING: ReadonlyArray<{ value: LodgingStyle; label: string }> = [
  { value: "budget", label: "Budget" },
  { value: "standard", label: "Standard" },
  { value: "comfort", label: "Comfort" },
];

export const MAX_BUDGET_TRY = 10_000_000;
export const TEXT_MIN = 20;
export const TEXT_MAX = 2000;

export type TripDraft = {
  event: { name: string; city: string; startDate: string; endDate: string; sourceUrl: string };
  origin: Origin;
  departFrom: string;
  returnBy: string;
  budgetTry: number;
  places: Place[];
  lodging: LodgingStyle;
};

export const SWITCH_EXAMPLE: TripDraft = {
  event: {
    name: "SWITCH 2026",
    city: "Singapore",
    startDate: "2026-10-27",
    endDate: "2026-10-29",
    sourceUrl: "https://www.switchsg.org/",
  },
  origin: "Istanbul",
  departFrom: "2026-10-21",
  returnBy: "2026-11-01",
  budgetTry: 100000,
  places: ["Bangkok"],
  lodging: "standard",
};

export type DraftErrors = Partial<Record<"eventDates" | "departure" | "returnBy" | "budget", string>>;

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
export const wholeNumber = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);

export const isDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(toUtc(date).getTime());

/** YYYY-MM-DD moved by whole days. */
export function shiftDay(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function validateDraft(draft: TripDraft): DraftErrors {
  const errors: DraftErrors = {};
  const { startDate, endDate } = draft.event;
  const eventOk = isDate(startDate) && isDate(endDate) && endDate >= startDate;
  if (!eventOk) {
    errors.eventDates = "Set both event days. The event has to end on or after the day it starts.";
  }
  if (!isDate(draft.departFrom)) {
    errors.departure = `Choose the earliest day you can leave ${draft.origin}.`;
  } else if (eventOk && draft.departFrom >= startDate) {
    errors.departure = `Leave before the event starts on ${dayFormat.format(toUtc(startDate))}. Pick an earlier date.`;
  }
  if (!isDate(draft.returnBy)) {
    errors.returnBy = `Choose the latest day you can be back in ${draft.origin}.`;
  } else if (eventOk && draft.returnBy <= endDate) {
    errors.returnBy = `Be back after the event ends on ${dayFormat.format(toUtc(endDate))}. Pick a later date.`;
  }
  if (!Number.isFinite(draft.budgetTry) || draft.budgetTry <= 0) {
    errors.budget = "Enter your total budget in Turkish lira, above zero.";
  } else if (draft.budgetTry > MAX_BUDGET_TRY) {
    errors.budget = `Enter a budget of ${wholeNumber.format(MAX_BUDGET_TRY)} TRY or less.`;
  }
  return errors;
}

export function validateText(text: string): string | null {
  const length = text.trim().length;
  if (length < TEXT_MIN) {
    return `Add a little more detail: at least ${TEXT_MIN} characters, with your event, its dates and your budget.`;
  }
  if (text.length > TEXT_MAX) {
    return `Shorten your description to ${wholeNumber.format(TEXT_MAX)} characters or fewer. It has ${wholeNumber.format(
      text.length,
    )} now.`;
  }
  return null;
}

export function draftToBody(draft: TripDraft): OptimizeBody {
  return {
    overrides: {
      origin: { city: draft.origin },
      event: {
        name: draft.event.name,
        city: draft.event.city,
        startDate: draft.event.startDate,
        endDate: draft.event.endDate,
      },
      travelWindow: { startDate: draft.departFrom, endDate: draft.returnBy },
      budget: { amountMinor: Math.round(draft.budgetTry) * 100, currency: "TRY" },
      optionalCities: draft.places.slice(0, MAX_PLACES).map((city) => ({ city })),
      preferences: { lodgingStyle: draft.lodging },
    },
  };
}

export const textToBody = (text: string): OptimizeBody => ({ text: text.trim() });

// Board flaps only carry A-Z 0-9 and a little punctuation.
function boardSafe(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .,\-/:']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const draftLabel = (draft: TripDraft) => `${boardSafe(draft.origin)} > ${boardSafe(draft.event.city)}`;
export const TEXT_LABEL = "YOUR TRIP";
