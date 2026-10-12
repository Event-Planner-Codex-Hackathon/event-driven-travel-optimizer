import { NextResponse } from "next/server";
import { eventImportBodySchema, type EventImportResponse } from "@/contract/trip";
import { importEventbrite } from "@/server/events";
import { attachGuestCookie, consume, guestFromRequest, refund } from "@/server/guest";
import { apiError, readBodyOr413 } from "@/server/http";

export const runtime = "nodejs";
export const maxDuration = 20;

/** Import one Eventbrite event from its link or id (Eventbrite offers no keyword search). */
export async function POST(req: Request) {
  const guest = guestFromRequest(req);
  const body = await readBodyOr413(req, guest);
  if (!body.ok) return body.response;
  const parsed = eventImportBodySchema.safeParse(body.body);
  if (!parsed.success) return apiError(400, "invalid_body", "Expected { url }.", parsed.error.issues, { guest });

  const token = process.env.EVENTBRITE_TOKEN || undefined;
  if (!token) return apiError(503, "provider_unavailable", "Eventbrite import is not configured on this server.", undefined, { guest });
  const allowed = consume(guest, "eventSearch");
  if (!allowed.ok) return apiError(429, "rate_limited", "Event lookups are limited for guests. Try again later.", undefined, { guest, retryAfterSeconds: allowed.retryAfterSeconds });

  const result = await importEventbrite(parsed.data.url, token);
  if (!result.spentProviderCall) refund(guest, "eventSearch", allowed.reservation);
  if (!result.ok) {
    return apiError(result.status, result.code, result.message, undefined, { guest });
  }
  const response: EventImportResponse = { candidate: result.candidate, sources: [{ source: "eventbrite", status: "ok" }] };
  return attachGuestCookie(NextResponse.json(response), guest);
}
