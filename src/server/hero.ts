/**
 * Decorative route banner via Fal.ai (server-side only; FAL_KEY never leaves
 * the server). The banner never affects feasibility or ranking.
 *
 * Credit protection:
 * - generated only on explicit request, one image per call, cheapest model;
 * - cached by city sequence + event, so reoptimizing the same route reuses it;
 * - concurrent identical requests share one generation;
 * - a hard per-process cap (FAL_MAX_GENERATIONS, default 25).
 */
import { createHash } from "node:crypto";
import { fal } from "@fal-ai/client";
import type { HeroImage } from "@/contract/trip";
import { heroBudget, heroCache } from "./store";

const MODEL = "fal-ai/flux/schnell";
const TIMEOUT_MS = 60_000;

export type HeroContext = { title: string; cities: string[]; eventName: string };

export type HeroOutcome =
  | { ok: true; heroImage: HeroImage; cached: boolean }
  | { ok: false; code: "hero_disabled" | "hero_limit_reached" | "hero_failed"; message: string };

const inFlight = new Map<string, Promise<HeroOutcome>>();

export function heroKey(ctx: HeroContext): string {
  return createHash("sha256").update(`${ctx.cities.join(">")}|${ctx.eventName}`).digest("hex").slice(0, 16);
}

export function buildHeroPrompt(ctx: HeroContext): string {
  const stops = ctx.cities.filter((c, i, arr) => arr.indexOf(c) === i);
  return [
    `Cinematic ultra-wide travel banner for a journey through ${stops.join(", ")}.`,
    `Iconic skylines and landmarks of ${stops.join(" and ")} blended left to right like a single panoramic film still,`,
    "golden hour light, soft atmospheric haze, a faint flight path arc across the sky,",
    "rich but natural colors, high detail, photographic.",
    "No text, no letters, no logos, no watermarks, no recognizable faces.",
  ].join(" ");
}

function maxGenerations(): number {
  const n = Number(process.env.FAL_MAX_GENERATIONS ?? 25);
  return Number.isFinite(n) && n >= 0 ? n : 25;
}

async function generate(key: string, ctx: HeroContext): Promise<HeroOutcome> {
  const credentials = process.env.FAL_KEY;
  if (!credentials) return { ok: false, code: "hero_disabled", message: "Banner generation is not configured on this server." };
  if (heroBudget.used() >= maxGenerations())
    return { ok: false, code: "hero_limit_reached", message: "Banner generation limit reached for this session." };

  heroBudget.increment();
  fal.config({ credentials });
  try {
    const seed = parseInt(key.slice(0, 8), 16);
    const result = await Promise.race([
      fal.subscribe(MODEL, {
        input: {
          prompt: buildHeroPrompt(ctx),
          image_size: "landscape_16_9",
          num_images: 1,
          num_inference_steps: 4,
          seed,
          enable_safety_checker: true,
          output_format: "jpeg",
        },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    const url = (result.data as { images?: Array<{ url?: string }> }).images?.[0]?.url;
    if (!url) return { ok: false, code: "hero_failed", message: "The image service returned no image." };
    const heroImage: HeroImage = { status: "ready", url };
    heroCache.set(key, heroImage);
    return { ok: true, heroImage, cached: false };
  } catch (err) {
    // Never echo provider errors verbatim (they may include request details).
    const timedOut = err instanceof Error && err.message === "timeout";
    return { ok: false, code: "hero_failed", message: timedOut ? "Banner generation timed out. Try again." : "Banner generation failed. Try again." };
  }
}

export async function getOrCreateHero(ctx: HeroContext): Promise<HeroOutcome> {
  const key = heroKey(ctx);
  const cached = heroCache.get(key);
  if (cached?.status === "ready") return { ok: true, heroImage: cached, cached: true };

  const pending = inFlight.get(key);
  if (pending) return pending;

  const job = generate(key, ctx).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}
