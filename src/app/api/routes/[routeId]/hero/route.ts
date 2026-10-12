import { NextResponse } from "next/server";
import { heroBodySchema, type HeroResponse } from "@/contract/trip";
import { getOrCreateHero, type HeroContext } from "@/server/hero";
import { apiError, readJson } from "@/server/http";
import { getRoute } from "@/server/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await params;
  const parsed = heroBodySchema.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return apiError(400, "invalid_body", "Invalid request body.", parsed.error.issues);

  const route = getRoute(routeId);
  const ctx: HeroContext | undefined = route
    ? {
        title: route.title,
        cities: route.citySequence.filter((s) => s.purpose !== "origin").map((s) => s.city),
        eventName: route.event.name,
      }
    : parsed.data.route;
  if (!ctx) return apiError(404, "route_not_found", `Unknown routeId ${routeId}. Send route context in the body.`);

  const outcome = await getOrCreateHero(ctx);
  if (!outcome.ok) {
    const status = outcome.code === "hero_failed" ? 502 : outcome.code === "hero_limit_reached" ? 429 : 503;
    return apiError(status, outcome.code, outcome.message);
  }
  if (route) route.heroImage = outcome.heroImage;
  return NextResponse.json<HeroResponse>({ routeId, heroImage: outcome.heroImage, cached: outcome.cached });
}
