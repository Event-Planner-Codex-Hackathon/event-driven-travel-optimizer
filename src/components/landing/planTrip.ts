import { ApiRequestError, optimizeTrip } from "@/contract/client";
import type { Money, RequestOverrides, RouteOption } from "@/contract/trip";
import type { TripDraft } from "./TripForm";

const STOP_CITY = { bangkok: "Bangkok", taipei: "Taipei" } as const;

const amount = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export function formatMoney(money: Money) {
  return `${amount.format(money.amountMinor / 100)} ${money.currency}`;
}

export type RouteSummary = {
  id: string;
  label: string;
  title: string;
  path: string;
  total: string;
  budget: string;
  withinBudget: boolean;
  recommended: boolean;
  difference: string;
  highlight: string | null;
};

export type PlanResult =
  | { kind: "routes"; message: string; routes: RouteSummary[] }
  | { kind: "message"; message: string };

export function toOverrides(draft: TripDraft): RequestOverrides {
  return {
    origin: { city: draft.origin },
    event: {
      name: draft.event.name,
      city: draft.event.city,
      startDate: draft.event.startDate,
      endDate: draft.event.endDate,
    },
    travelWindow: { startDate: draft.departFrom, endDate: draft.returnBy },
    budget: { amountMinor: Math.round(draft.budgetTry * 100), currency: "TRY" },
    optionalCities: draft.optionalStop === "none" ? [] : [{ city: STOP_CITY[draft.optionalStop] }],
  };
}

// The first planner highlight that not every route shares, so each row says what sets it apart.
function distinctHighlight(option: RouteOption, all: RouteOption[]): string | null {
  const others = all.filter((other) => other.id !== option.id);
  return option.highlights.find((line) => !others.every((other) => other.highlights.includes(line))) ?? null;
}

function summarize(option: RouteOption, all: RouteOption[], recommendedId: string | null): RouteSummary {
  const { total, budget, remaining } = option.costBreakdown;
  const within = option.feasibility.withinBudget;
  const gap = formatMoney({ ...remaining, amountMinor: Math.abs(remaining.amountMinor) });
  return {
    id: option.id,
    label: option.label,
    title: option.title,
    path: option.citySequence.map((stop) => stop.city).join(" → "),
    total: formatMoney(total),
    budget: formatMoney(budget),
    withinBudget: within,
    recommended: option.id === recommendedId,
    difference: within ? `${gap} under budget` : `${gap} over budget`,
    highlight: distinctHighlight(option, all),
  };
}

// Sends the form to the planner and returns what the form should show.
export async function planTrip(draft: TripDraft, signal?: AbortSignal): Promise<PlanResult> {
  try {
    const response = await optimizeTrip({ overrides: toOverrides(draft) }, signal);
    if (response.status === "needs_input") {
      return {
        kind: "message",
        message: response.clarificationQuestions[0] ?? "We need a little more detail before we can compare routes.",
      };
    }
    const routes = response.options.map((option) =>
      summarize(option, response.options, response.recommendedOptionId),
    );
    const message = response.recommendedOptionId
      ? `${routes.length} routes compared. All prices are estimates.`
      : `${routes.length} routes compared, but none fits your budget. All prices are estimates.`;
    return { kind: "routes", message, routes };
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    if (error instanceof ApiRequestError && error.code === "network") {
      return { kind: "message", message: "We couldn’t reach the planner. Check your connection and try again." };
    }
    return { kind: "message", message: "The planner couldn’t compare routes just now. Try again in a moment." };
  }
}
