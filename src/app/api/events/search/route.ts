import { NextResponse } from "next/server";
import { eventSearchQuerySchema, type EventSearchResponse } from "@/contract/trip";
import { todayLocal } from "@/server/dates";
import { searchEvents } from "@/server/events";
import { attachGuestCookie, consume, guestFromRequest, refund } from "@/server/guest";
import { apiError } from "@/server/http";

export const runtime = "nodejs";
export const maxDuration = 20;

/** Search events by name (catalog always; Google Events / Ticketmaster when keys are set). Suggestions only. */
export async function GET(req: Request) {
  const guest = guestFromRequest(req);
  const parsed = eventSearchQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return apiError(400, "invalid_body", "Expected ?q=<event name>&city=<optional city>.", parsed.error.issues, { guest });

  const serpApiKey = process.env.SERPAPI_API_KEY || undefined;
  const ticketmasterKey = process.env.TICKETMASTER_API_KEY || undefined;
  let reservation: string | undefined;
  if (serpApiKey || ticketmasterKey) {
    const allowed = consume(guest, "eventSearch");
    if (!allowed.ok) return apiError(429, "rate_limited", "Event searches are limited for guests. Try again later.", undefined, { guest, retryAfterSeconds: allowed.retryAfterSeconds });
    reservation = allowed.reservation;
  }

  const { q, city } = parsed.data;
  const result = await searchEvents(q, city, { serpApiKey, ticketmasterKey, today: todayLocal() });
  if (reservation && result.meteredCalls === 0) refund(guest, "eventSearch", reservation);

  const body: EventSearchResponse = {
    query: { q, ...(city ? { city } : {}) },
    results: result.results,
    sources: result.sources,
    note: "Suggestions only. Confirm the event, then send its overrides.event to /api/trips/optimize; its city and dates become the locked constraint.",
  };
  return attachGuestCookie(NextResponse.json(body), guest);
}
