/**
 * Decorative route banner via Fal.ai (server-side only; FAL_KEY never leaves
 * the server). The banner never affects feasibility or ranking.
 *
 * Credit protection:
 * - generated only on explicit request, one image per call, cheapest model;
 * - cached by city sequence + event, so reoptimizing the same route reuses it;
 * - concurrent identical requests share one generation, and a timed-out
 *   job is resumed on retry instead of being submitted again;
 * - a hard per-process cap (FAL_MAX_GENERATIONS, default 25).
 */
import { createHash } from "node:crypto";
import { fal } from "@fal-ai/client";
import type { HeroImage } from "@/contract/trip";
import { heroBudget, heroCache } from "./store";

const MODEL = "fal-ai/flux/schnell";
/** How long one HTTP request waits for the queued job before answering "still generating". */
const WAIT_MS = 50_000;
const POLL_MS = 1_000;

export type HeroContext = { title: string; cities: string[]; eventName: string };

export type HeroOutcome =
  | { ok: true; heroImage: HeroImage; cached: boolean; newGeneration: boolean }
  | { ok: false; code: "hero_disabled" | "hero_limit_reached" | "hero_failed"; message: string; newGeneration: boolean };

const inFlight = new Map<string, Promise<HeroOutcome>>();
type Pending = { requestId: string };
const g = globalThis as typeof globalThis & { __eventhopperHeroJobs?: Map<string, Pending> };
const pendingJobs: Map<string, Pending> = (g.__eventhopperHeroJobs ??= new Map());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/**
 * Uses the Fal queue so a slow job is never paid for twice: the request id is
 * kept, and a retry resumes polling the same job instead of submitting again.
 */
async function generate(key: string, ctx: HeroContext): Promise<HeroOutcome> {
  const credentials = process.env.FAL_KEY;
  if (!credentials) return { ok: false, code: "hero_disabled", message: "Banner generation is not configured on this server.", newGeneration: false };
  fal.config({ credentials });

  // Never age out an unresolved request id: resubmitting after an arbitrary
  // timeout could create a second billable image while the first is still queued.
  let job = pendingJobs.get(key);
  const newGeneration = !job;
  if (!job) {
    if (heroBudget.used() >= maxGenerations())
      return { ok: false, code: "hero_limit_reached", message: "Banner generation limit reached for this session.", newGeneration: false };
    heroBudget.increment();
    try {
      const queued = await fal.queue.submit(MODEL, {
        input: {
          prompt: buildHeroPrompt(ctx),
          image_size: "landscape_16_9",
          num_images: 1,
          num_inference_steps: 4,
          seed: parseInt(key.slice(0, 8), 16),
          enable_safety_checker: true,
          output_format: "jpeg",
        },
      });
      job = { requestId: queued.request_id };
      pendingJobs.set(key, job);
    } catch {
      // Never echo provider errors verbatim (they may include request details).
      // Submission may have reached Fal even if its response was lost; count it
      // conservatively so retries cannot bypass the guest allowance.
      return { ok: false, code: "hero_failed", message: "Banner generation failed. Try again.", newGeneration: true };
    }
  }

  const deadline = Date.now() + WAIT_MS;
  try {
    while (Date.now() < deadline) {
      const status = await fal.queue.status(MODEL, { requestId: job.requestId });
      if (status.status === "COMPLETED") {
        const result = await fal.queue.result(MODEL, { requestId: job.requestId });
        pendingJobs.delete(key);
        const url = (result.data as { images?: Array<{ url?: string }> }).images?.[0]?.url;
        if (!url) return { ok: false, code: "hero_failed", message: "The image service returned no image.", newGeneration };
        const heroImage: HeroImage = { status: "ready", url };
        heroCache.set(key, heroImage);
        return { ok: true, heroImage, cached: false, newGeneration };
      }
      await sleep(POLL_MS);
    }
  } catch {
    // Keep the request id after transient status/result failures so retries
    // continue the same provider job instead of submitting another one.
    return { ok: false, code: "hero_failed", message: "Could not check banner status. Retry shortly; the existing job was kept.", newGeneration };
  }
  // Still running: keep the job so a retry picks up the same result.
  return { ok: false, code: "hero_failed", message: "The banner is still generating. Try again in a few seconds.", newGeneration };
}

export async function getOrCreateHero(ctx: HeroContext): Promise<HeroOutcome> {
  const key = heroKey(ctx);
  const cached = heroCache.get(key);
  if (cached?.status === "ready") return { ok: true, heroImage: cached, cached: true, newGeneration: false };

  const pending = inFlight.get(key);
  if (pending) return pending.then((outcome) => ({ ...outcome, newGeneration: false }));

  const job = generate(key, ctx).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}
