import { ApiRequestError, optimizeTrip } from "@/contract/client";
import type { Money, RequestOverrides } from "@/contract/trip";
import type { TripDraft } from "./TripForm";

const STOP_CITY = { bangkok: "Bangkok", taipei: "Taipei" } as const;

const amount = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

function formatMoney(money: Money) {
  return `${amount.format(money.amountMinor / 100)} ${money.currency}`;
}

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

// Sends the form to the planner and returns one line for the form's status area.
export async function planTrip(draft: TripDraft): Promise<string> {
  try {
    const response = await optimizeTrip({ overrides: toOverrides(draft) });
    if (response.status === "needs_input") {
      return response.clarificationQuestions[0] ?? "We need a little more detail before we can compare routes.";
    }
    const recommended = response.options.find((option) => option.id === response.recommendedOptionId);
    if (!recommended) {
      return `${response.options.length} routes found, but none fits your budget. Each one is marked with how far over it goes.`;
    }
    return `${response.options.length} routes found. Recommended: ${recommended.title}, estimated total ${formatMoney(
      recommended.costBreakdown.total,
    )} of your ${formatMoney(recommended.costBreakdown.budget)} budget.`;
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === "network") {
      return "We couldn’t reach the planner. Check your connection and try again.";
    }
    return "The planner couldn’t compare routes just now. Try again in a moment.";
  }
}
