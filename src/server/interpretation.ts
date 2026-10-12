/** Request interpretation is optional; the planner and explicit form fields stay authoritative. */
import type { FxInfo, OptimizeBody, TripResponse } from "@/contract/trip";
import { todayLocal } from "./dates";
import { consume, refund, type Guest } from "./guest";
import { aiParsingEnabled, interpretText } from "./providers/openai";
import { saveTrip } from "./store";
import { optimizeTrip } from "./trips";

export async function optimizeWithInterpretation(
  input: OptimizeBody, fx?: FxInfo | null, guest?: Guest,
  opts: { today?: string; fetcher?: typeof fetch } = {},
): Promise<TripResponse> {
  const today = opts.today ?? todayLocal();
  if (!input.text?.trim()) return optimizeTrip(input, today, fx);
  if (!aiParsingEnabled()) {
    const response = optimizeTrip(input, today, fx);
    const note = "OpenAI interpretation is disabled; the deterministic parser was used. A server key and explicit API spending authorization are required to enable it.";
    const result: TripResponse = { ...response, interpretation: { mode: "deterministic", status: "disabled", note }, assumptions: [...response.assumptions, note] };
    saveTrip(result);
    return result;
  }
  const reservation = guest ? consume(guest, "interpret") : undefined;
  if (reservation && !reservation.ok) {
    const response = optimizeTrip(input, today, fx);
    const note = "Your AI interpretation allowance is exhausted; the deterministic parser was used.";
    const result: TripResponse = { ...response, interpretation: { mode: "deterministic", status: "fallback", note }, assumptions: [...response.assumptions, note] };
    saveTrip(result);
    return result;
  }
  const interpreted = await interpretText(input.text, today, opts.fetcher);
  if (guest && reservation?.ok && !interpreted.spentProviderCall) refund(guest, "interpret", reservation.reservation);
  const response = optimizeTrip(input, today, fx, interpreted.ok ? interpreted.parsed : undefined);
  const note = interpreted.ok
    ? "OpenAI interpreted the text into validated requirements. Explicit form fields win; all route feasibility, costs and ranking are deterministic."
    : interpreted.note;
  const result: TripResponse = {
    ...response,
    interpretation: interpreted.ok
      ? { mode: "openai", status: "used", model: interpreted.model, fromCache: interpreted.fromCache, note, ...(interpreted.usage ? { usage: interpreted.usage } : {}) }
      : { mode: "deterministic", status: "fallback", note },
    assumptions: [...response.assumptions, note],
  };
  saveTrip(result);
  return result;
}
