import { NextResponse } from "next/server";
import { recommendEventsBodySchema, type RouteOption } from "@/contract/trip";
import { getRoute } from "@/server/store";
import { findCity } from "@/server/catalog";
import { recommendForRoute } from "@/server/recommendations";
import { apiError, readBodyOr413 } from "@/server/http";
import { attachGuestCookie, consume, guestFromRequest } from "@/server/guest";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;
  const guest = guestFromRequest(req);
  const body = await readBodyOr413(req, guest);
  if (!body.ok) return body.response;
  const parsed = recommendEventsBodySchema.safeParse(body.body);
  if (!parsed.success) return apiError(400, "invalid_body", "Provide a travel brief and route context.", undefined, { guest });
  const fallback = parsed.data.route;
  if (fallback.cities.some((city) => !findCity(city.city) || city.departureDate <= city.arrivalDate)) return apiError(400, "invalid_body", "Choose supported cities with a valid visit interval.", undefined, { guest });
  const allowed = consume(guest, "eventSearch");
  if (!allowed.ok) return apiError(429, "rate_limited", "Event recommendation allowance reached.", undefined, { guest, retryAfterSeconds: allowed.retryAfterSeconds });
  const route = getRoute(routeId) ?? { id: routeId, citySequence: fallback.cities.map((city) => ({ ...city, purpose: city.city === fallback.event.city ? "event" : "stopover" })), event: { ...fallback.event, locked: true } } as RouteOption;
  const response = await recommendForRoute(route, parsed.data.brief);
  return attachGuestCookie(NextResponse.json(response), guest);
}
