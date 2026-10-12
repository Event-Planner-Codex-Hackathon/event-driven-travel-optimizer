import { NextResponse } from "next/server";
import { heroBodySchema, type HeroResponse } from "@/contract/trip";
import { attachGuestCookie, consume, guestFromRequest, refund } from "@/server/guest";
import { getOrCreateHero, type HeroContext } from "@/server/hero";
import { apiError, readBodyOr413 } from "@/server/http";
import { getRoute } from "@/server/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;
  const guest = guestFromRequest(req);
  const body = await readBodyOr413(req, guest);
  if (!body.ok) return body.response;
  const parsed = heroBodySchema.safeParse(body.body ?? {});
  if (!parsed.success) return apiError(400, "invalid_body", "Invalid request body.", parsed.error.issues, { guest });

  const route = getRoute(routeId);
  const ctx: HeroContext | undefined = route
    ? {
        title: route.title,
        cities: route.citySequence.filter((s) => s.purpose !== "origin").map((s) => s.city),
        eventName: route.event.name,
      }
    : parsed.data.route;
  if (!ctx) return apiError(404, "route_not_found", `Unknown routeId ${routeId}. Send route context in the body.`, undefined, { guest });

  if (!process.env.FAL_KEY) return apiError(503, "hero_disabled", "Banner generation is not configured on this server.", undefined, { guest });
  const allowed = consume(guest, "hero");
  if (!allowed.ok) return apiError(429, "rate_limited", "Banner generation is limited for guests. Try again later.", undefined, { guest, retryAfterSeconds: allowed.retryAfterSeconds });
  const reservation = allowed.reservation;

  const outcome = await getOrCreateHero(ctx);
  if (!outcome.newGeneration) refund(guest, "hero", reservation); // only new Fal submissions count
  if (!outcome.ok) {
    const status = outcome.code === "hero_failed" ? 502 : outcome.code === "hero_limit_reached" ? 429 : 503;
    return apiError(status, outcome.code, outcome.message, undefined, { guest });
  }
  if (route) route.heroImage = outcome.heroImage;
  return attachGuestCookie(NextResponse.json<HeroResponse>({ routeId, heroImage: outcome.heroImage, cached: outcome.cached }), guest);
}
