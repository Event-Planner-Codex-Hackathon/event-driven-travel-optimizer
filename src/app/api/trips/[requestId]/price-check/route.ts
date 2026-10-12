import { NextResponse } from "next/server";
import { priceCheckBodySchema, type TripResponse } from "@/contract/trip";
import { attachGuestCookie, consume, guestFromRequest, refund } from "@/server/guest";
import { apiError, readBodyOr413 } from "@/server/http";
import { priceCheckTrip } from "@/server/pricing";
import { getPricingRuntime } from "@/server/providers/runtime";
import { getTrip, saveTrip } from "@/server/store";
import { getFxRates } from "@/server/providers/fx";
import { attachFx, reoptimizeTrip } from "@/server/trips";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const guest = guestFromRequest(req);
  const body = await readBodyOr413(req, guest);
  if (!body.ok) return body.response;
  const parsed = priceCheckBodySchema.safeParse(body.body ?? {});
  if (!parsed.success) return apiError(400, "invalid_body", "Invalid request body.", parsed.error.issues, { guest });

  const pricing = getPricingRuntime();
  if (!pricing.available) return apiError(503, "provider_unavailable", "Live prices are not configured on this server.", undefined, { guest });

  let prev: TripResponse | undefined = getTrip(requestId);
  try {
    if (!prev) {
      if (!parsed.data.baseRequest) return apiError(404, "request_not_found", `Unknown requestId ${requestId}. Send baseRequest.`, undefined, { guest });
      const replanned = reoptimizeTrip(requestId, {}, parsed.data.baseRequest);
      if (!replanned.ok) return apiError(404, replanned.code, replanned.message, undefined, { guest });
      prev = { ...replanned.response, requestId, requirementsVersion: parsed.data.baseRequirementsVersion ?? 1 };
    }
  } catch (err) {
    console.error("price check replan failed", err);
    return apiError(400, "invalid_body", "Could not rebuild this trip from baseRequest.", undefined, { guest });
  }
  if (prev.status !== "ready") return apiError(400, "invalid_body", "This trip has no options to price yet.", undefined, { guest });

  const allowed = consume(guest, "priceCheck");
  if (!allowed.ok) return apiError(429, "rate_limited", "Live price checks are limited for guests. Try again later.", undefined, { guest, retryAfterSeconds: allowed.retryAfterSeconds });
  const reservation = allowed.reservation;

  try {
    const [checked, fx] = await Promise.all([priceCheckTrip(prev, pricing), getFxRates()]);
    const result = attachFx(checked, fx);
    saveTrip(result);
    // Failed provider searches can still consume the provider's search quota.
    if (result.pricing.providerCalls === 0) refund(guest, "priceCheck", reservation);
    return attachGuestCookie(NextResponse.json<TripResponse>(result), guest);
  } catch (err) {
    console.error("price check failed", err);
    if (err instanceof Error && "providerCalls" in err && err.providerCalls === 0) refund(guest, "priceCheck", reservation);
    return apiError(500, "internal", "Could not check live prices.", undefined, { guest });
  }
}
