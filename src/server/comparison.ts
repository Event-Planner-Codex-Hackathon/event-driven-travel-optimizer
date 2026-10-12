/**
 * Deterministic option-vs-baseline comparison, computed from the returned
 * itineraries only (no provider calls).
 */
import type { OptionComparison, RouteOption } from "@/contract/trip";
import { formatMoney, money } from "./money";

const nights = (o: RouteOption) => o.stays.reduce((n, s) => n + s.nights, 0);
const minutes = (o: RouteOption) => o.legs.reduce((m, l) => m + (l.durationMinutes ?? 0), 0);
const connections = (o: RouteOption) => o.legs.reduce((n, l) => n + (l.stops ?? 0), 0);
const visited = (o: RouteOption) => o.citySequence.filter((s) => s.purpose !== "origin").map((s) => s.city);

/** "provider" if every leg and stay is provider-priced, "estimate" if none, else "mixed". */
function pricingSignature(o: RouteOption): string {
  const lines = [...o.legs, ...o.stays];
  const provider = lines.filter((l) => l.estimateSource === "provider").length;
  if (provider === 0) return "estimate";
  if (provider !== lines.length) return "mixed";
  const retrievals = new Set(lines.map((l) => l.source?.retrieval ?? "live"));
  return retrievals.size === 1 ? `provider:${[...retrievals][0]}` : "mixed";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function compareOptions(option: RouteOption, baseline: RouteOption): OptionComparison {
  const currency = option.costBreakdown.total.currency;
  const d = (a: number, b: number) => a - b;
  const delta = {
    total: money(d(option.costBreakdown.total.amountMinor, baseline.costBreakdown.total.amountMinor), currency),
    transport: money(d(option.costBreakdown.transport.amountMinor, baseline.costBreakdown.transport.amountMinor), currency),
    lodging: money(d(option.costBreakdown.lodging.amountMinor, baseline.costBreakdown.lodging.amountMinor), currency),
    nights: d(nights(option), nights(baseline)),
    flights: d(option.legs.length, baseline.legs.length),
    connections: d(connections(option), connections(baseline)),
    travelMinutes: d(minutes(option), minutes(baseline)),
  };
  const addedCities = visited(option).filter((c) => !visited(baseline).includes(c));
  const droppedCities = visited(baseline).filter((c) => !visited(option).includes(c));
  const comparablePricing = pricingSignature(option) === pricingSignature(baseline) && pricingSignature(option) !== "mixed";
  const isBaseline = option.id === baseline.id;

  const parts: string[] = [];
  if (!isBaseline) {
    const abs = money(Math.abs(delta.total.amountMinor), currency);
    if (delta.total.amountMinor !== 0) parts.push(`${formatMoney(abs)} ${delta.total.amountMinor < 0 ? "cheaper" : "more"}`);
    else parts.push("same total");
    if (delta.flights !== 0) parts.push(`${plural(Math.abs(delta.flights), "flight")} ${delta.flights > 0 ? "more" : "fewer"}`);
    if (delta.connections !== 0) parts.push(`${plural(Math.abs(delta.connections), "connection")} ${delta.connections > 0 ? "more" : "fewer"}`);
    if (delta.nights !== 0) parts.push(`${plural(Math.abs(delta.nights), "night")} ${delta.nights > 0 ? "more" : "less"}`);
    const hours = Math.round(delta.travelMinutes / 60);
    if (Math.abs(hours) >= 1) parts.push(`~${Math.abs(hours)}h ${hours > 0 ? "more" : "less"} flying`);
    if (addedCities.length) parts.push(`adds ${addedCities.join(", ")}`);
    if (droppedCities.length) parts.push(`skips ${droppedCities.join(", ")}`);
    if (!comparablePricing) parts.push("prices from different sources");
  }

  return {
    baselineOptionId: baseline.id,
    isBaseline,
    delta,
    addedCities,
    droppedCities,
    comparablePricing,
    summary: parts.join(" · "),
  };
}

/** Attach comparisons against the recommended option (or the top-ranked one when none fits the budget). */
export function withComparisons(options: RouteOption[], recommendedId: string | null): RouteOption[] {
  const baseline = options.find((o) => o.id === recommendedId) ?? options[0];
  if (!baseline) return options;
  return options.map((o) => ({ ...o, comparison: compareOptions(o, baseline) }));
}
