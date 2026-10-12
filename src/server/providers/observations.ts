/**
 * Recorded provider observations.
 *
 * - `record` mode wraps the live provider and saves every successful result
 *   (offers, query, original time, public search URL — never the API key).
 * - `replay` mode serves those saved results without any provider call. They
 *   keep their original observedAt and are labeled retrieval: "replay", so a
 *   recorded price is never presented as a current one.
 *
 * Check the provider's terms before committing recordings to a shared repo.
 */
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FlightOffer, FlightQuery, HotelOffer, HotelQuery, PriceProvider, ProviderResult, ProviderSuccess } from "./types";

export type Observation<Q, O> = {
  version: 1;
  kind: "flight" | "hotel";
  provider: string;
  query: Q;
  observedAt: string;
  searchUrl?: string;
  offers: O[];
};

export const flightKey = (q: FlightQuery) => `f|${q.fromAirports.join(",")}|${q.toAirports.join(",")}|${q.date}`;
export const hotelKey = (q: HotelQuery) => `h|${q.city}|${q.checkIn}|${q.checkOut}|${q.style}`;

export function observationsDir(): string {
  const custom = process.env.PRICE_OBSERVATIONS_DIR;
  return custom
    ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), custom)
    : path.join(process.cwd(), "data", "observations");
}

function fileFor(dir: string, key: string): string {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 20);
  return path.join(/*turbopackIgnore: true*/ dir, `${key[0] === "f" ? "flight" : "hotel"}-${hash}.json`);
}

async function save<Q, O>(dir: string, key: string, kind: "flight" | "hotel", provider: string, query: Q, r: ProviderSuccess<O>): Promise<void> {
  const obs: Observation<Q, O> = { version: 1, kind, provider, query, observedAt: r.observedAt, ...(r.searchUrl ? { searchUrl: r.searchUrl } : {}), offers: r.offers };
  try {
    await mkdir(dir, { recursive: true });
    const destination = fileFor(dir, key);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(obs, null, 2)}\n`, "utf8");
    await rename(temporary, destination);
  } catch (err) {
    // A read-only filesystem must not break live pricing.
    console.warn("could not record price observation", (err as Error).message);
  }
}

/** Live provider that also records each successful result. */
export function withRecording(live: PriceProvider, dir = observationsDir()): PriceProvider {
  return {
    name: live.name,
    cacheScope: `record|${live.name}|${path.resolve(dir)}`,
    async flights(q) {
      const r = await live.flights(q);
      if (r.ok) await save(dir, flightKey(q), "flight", live.name, q, r);
      return r;
    },
    async hotels(q) {
      const r = await live.hotels(q);
      if (r.ok) await save(dir, hotelKey(q), "hotel", live.name, q, r);
      return r;
    },
  };
}

const amountSchema = z.object({ amountMinor: z.number().int().safe().positive(), currency: z.literal("TRY") });
const airportSchema = z.array(z.string().regex(/^[A-Z]{3}$/)).min(1).max(10);
const flightQuerySchema = z.object({ fromAirports: airportSchema, toAirports: airportSchema, date: z.iso.date() });
const hotelQuerySchema = z.object({ city: z.string().min(1).max(60), checkIn: z.iso.date(), checkOut: z.iso.date(), style: z.enum(["budget", "standard", "comfort"]) });
const flightOfferSchema = z.object({
  price: amountSchema, departureDate: z.iso.date(), arrivalDate: z.iso.date(),
  durationMinutes: z.number().finite().nonnegative().optional(), stops: z.number().int().nonnegative(), description: z.string(),
}).refine((o) => o.arrivalDate >= o.departureDate);
const hotelOfferSchema = z.object({ name: z.string().min(1), total: amountSchema, derivedFromNightly: z.boolean(), hotelClass: z.number().int().min(1).max(5).optional() });
const observationBase = z.object({ version: z.literal(1), provider: z.literal("serpapi"), observedAt: z.iso.datetime(), searchUrl: z.string().optional() });
const observationSchema = z.discriminatedUnion("kind", [
  observationBase.extend({ kind: z.literal("flight"), query: flightQuerySchema, offers: z.array(flightOfferSchema).min(1) }),
  observationBase.extend({ kind: z.literal("hotel"), query: hotelQuerySchema, offers: z.array(hotelOfferSchema).min(1) }),
]);

async function load(dir: string, key: string, kind: "flight" | "hotel"): Promise<Observation<unknown, FlightOffer | HotelOffer> | null> {
  try {
    const raw = await readFile(fileFor(dir, key), "utf8");
    if (Buffer.byteLength(raw) > 2_000_000) return null;
    const parsed = observationSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.kind !== kind) return null;
    const obs = parsed.data;
    const actualKey = obs.kind === "flight" ? flightKey(obs.query) : hotelKey(obs.query);
    if (actualKey !== key || Date.parse(obs.observedAt) > Date.now()) return null;
    // Keep only canonical public search pages; recordings cannot inject URLs or credentials.
    const searchUrl = obs.searchUrl === `https://www.google.com/travel/${kind === "flight" ? "flights" : "hotels"}` ? obs.searchUrl : undefined;
    return { ...obs, searchUrl };
  } catch {
    return null;
  }
}

function replayed<O>(obs: Observation<unknown, O> | null): ProviderResult<O> {
  if (!obs || obs.offers.length === 0)
    return { ok: false, reason: "empty", message: "No recorded observation for this search." };
  return {
    ok: true,
    offers: obs.offers,
    fetchedAt: new Date().toISOString(),
    observedAt: obs.observedAt,
    retrieval: "replay",
    fromCache: false,
    ...(obs.searchUrl ? { searchUrl: obs.searchUrl } : {}),
  };
}

/** Serves recorded observations only; never calls a provider. */
export function createReplayProvider(dir = observationsDir()): PriceProvider {
  return {
    name: "replay",
    cacheScope: `replay|${path.resolve(dir)}`,
    async flights(q: FlightQuery): Promise<ProviderResult<FlightOffer>> {
      return replayed(await load(dir, flightKey(q), "flight")) as ProviderResult<FlightOffer>;
    },
    async hotels(q: HotelQuery): Promise<ProviderResult<HotelOffer>> {
      return replayed(await load(dir, hotelKey(q), "hotel")) as ProviderResult<HotelOffer>;
    },
  };
}
