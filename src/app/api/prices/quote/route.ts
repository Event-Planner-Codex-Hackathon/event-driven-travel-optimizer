import { NextResponse } from "next/server";
import { quoteBodySchema, type QuoteResponse } from "@/contract/trip";
import { todayLocal } from "@/server/dates";
import { attachGuestCookie, consume, guestFromRequest, refund } from "@/server/guest";
import { apiError, readBodyOr413 } from "@/server/http";
import { getPricingRuntime } from "@/server/providers/runtime";
import { quotePrice } from "@/server/quote";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Guest price lookup: one flight or one hotel stay. Works without live prices (estimate only). */
export async function POST(req: Request) {
  const guest = guestFromRequest(req);
  const body = await readBodyOr413(req, guest);
  if (!body.ok) return body.response;
  const parsed = quoteBodySchema.safeParse(body.body);
  if (!parsed.success) return apiError(400, "invalid_body", "Invalid request body.", parsed.error.issues, { guest });

  const pricing = getPricingRuntime();
  let reservation: string | undefined;
  if (pricing.available) {
    const allowed = consume(guest, "quote");
    if (!allowed.ok) return apiError(429, "rate_limited", "Live price lookups are limited for guests. Try again later.", undefined, { guest, retryAfterSeconds: allowed.retryAfterSeconds });
    reservation = allowed.reservation;
  }
  const result = await quotePrice(parsed.data, pricing, todayLocal());
  // New outbound provider attempts count even when they fail; local cache/quota
  // responses and invalid inputs do not spend this guest allowance.
  if (reservation && !(result.ok && result.spentProviderCall)) refund(guest, "quote", reservation);
  if (!result.ok) return apiError(400, "invalid_body", result.message, undefined, { guest });
  return attachGuestCookie(NextResponse.json<QuoteResponse>(result.response), guest);
}
