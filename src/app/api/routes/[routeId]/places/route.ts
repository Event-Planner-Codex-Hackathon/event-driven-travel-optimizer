import { NextResponse } from "next/server";
import { nearbyPlacesBodySchema, type NearbyPlacesResponse } from "@/contract/trip";
import { findCity } from "@/server/catalog";
import { attachGuestCookie, consume, guestFromRequest, refund } from "@/server/guest";
import { apiError, readBodyOr413 } from "@/server/http";
import { GEOAPIFY_ATTRIBUTION, nearbyPlaces } from "@/server/providers/geoapify";
import { getRoute } from "@/server/store";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: Request, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;
  const guest = guestFromRequest(req);
  const body = await readBodyOr413(req, guest);
  if (!body.ok) return body.response;
  const parsed = nearbyPlacesBodySchema.safeParse(body.body ?? {});
  if (!parsed.success) return apiError(400, "invalid_body", "Expected optional { route: { cities: [...] } }.", parsed.error.issues, { guest });
  const route = getRoute(routeId);
  const names = route ? route.citySequence.filter((s) => s.purpose !== "origin").map((s) => s.city) : parsed.data.route?.cities;
  if (!names) return apiError(404, "route_not_found", "Unknown route. Send fallback catalog cities.", undefined, { guest });
  const cities = [...new Set(names)].map(findCity);
  if (cities.some((c) => !c) || cities.length > 2) return apiError(400, "invalid_body", "Choose at most two supported catalog cities.", undefined, { guest });
  if (!process.env.GEOAPIFY_API_KEY) return apiError(503, "provider_unavailable", "Geoapify is not configured on this server.", undefined, { guest });
  const allowed = consume(guest, "nearby");
  if (!allowed.ok) return apiError(429, "rate_limited", "Nearby place lookups are limited. Try later.", undefined, { guest, retryAfterSeconds: allowed.retryAfterSeconds });
  const results = await Promise.all(cities.map((city) => nearbyPlaces(city!)));
  const providerCalls = results.filter((r) => r.spentProviderCall).length;
  if (providerCalls === 0) refund(guest, "nearby", allowed.reservation);
  const response: NearbyPlacesResponse = { routeId, source: "geoapify", cities: results.map((r) => r.response), providerCalls, attribution: GEOAPIFY_ATTRIBUTION, note: "Optional suggestions only. No places, fees or opening hours change the route, event lock, budget or ranking. Show attribution and each city's status." };
  return attachGuestCookie(NextResponse.json(response), guest);
}
