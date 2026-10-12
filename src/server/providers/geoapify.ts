/** Nearby sights around catalog city centres. Decorative only; no geocoding or booking calls. */
import type { NearbyCityPlaces, NearbyPlace } from "@/contract/trip";
import type { CityInfo } from "../catalog";
import { distanceKm } from "../estimates";
import { limited } from "./limited";

const RADIUS = 5000;
const LIMIT = 5;
export const GEOAPIFY_ATTRIBUTION = "Powered by Geoapify · © OpenStreetMap contributors";
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const string = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function publicWebsite(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hostname === "api.geoapify.com") return undefined;
    url.search = ""; url.hash = "";
    return url.toString();
  } catch { return undefined; }
}

export function parseGeoapify(json: unknown, city: CityInfo): NearbyPlace[] | null {
  const root = record(json);
  if (root?.type !== "FeatureCollection" || !Array.isArray(root.features)) return null;
  const places = new Map<string, NearbyPlace>();
  for (const raw of root.features) {
    const feature = record(raw);
    const p = record(feature?.properties);
    const geometry = record(feature?.geometry);
    const coordinates = geometry?.coordinates;
    if (!p || geometry?.type !== "Point" || !Array.isArray(coordinates)) continue;
    const [longitude, latitude] = coordinates;
    const id = string(p.place_id); const name = string(p.name);
    if (!id || !name || !finite(latitude) || !finite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    if (typeof p.country_code === "string" && p.country_code.toUpperCase() !== city.countryCode) continue;
    const distanceMeters = Math.round(distanceKm(city, { ...city, lat: latitude, lon: longitude }) * 1000);
    if (distanceMeters > RADIUS) continue;
    const categories = Array.isArray(p.categories) ? p.categories.filter((c): c is string => typeof c === "string" && c.startsWith("tourism.sights")) : [];
    if (!categories.length) continue;
    const website = publicWebsite(p.website ?? record(record(p.datasource)?.raw)?.website);
    places.set(id, { id, name, latitude, longitude, categories, distanceMeters,
      ...(string(p.formatted) ? { address: string(p.formatted) } : {}), ...(website ? { website } : {}),
    });
  }
  return [...places.values()].sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, LIMIT);
}

export async function nearbyPlaces(city: CityInfo, fetcher: typeof fetch = fetch): Promise<{ response: NearbyCityPlaces; spentProviderCall: boolean }> {
  const base = { city: city.city, centre: { latitude: city.lat, longitude: city.lon }, radiusMeters: RADIUS, fromCache: false, places: [] as NearbyPlace[] };
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) return { response: { ...base, status: "not_configured", note: "Nearby places are not configured on this server." }, spentProviderCall: false };
  const lookup = await limited<NearbyCityPlaces>("GEOAPIFY", `${city.city}|sights|${RADIUS}|${LIMIT}`, 6 * 60 * 60_000, { hourly: 20, total: 100 }, async () => {
    const url = new URL("https://api.geoapify.com/v2/places");
    url.search = new URLSearchParams({ categories: "tourism.sights", filter: `circle:${city.lon},${city.lat},${RADIUS}`, bias: `proximity:${city.lon},${city.lat}`, limit: String(LIMIT), apiKey: key }).toString();
    try {
      const res = await fetcher(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!res.ok) return { ...base, status: res.status === 429 ? "quota" : "unavailable", note: "Geoapify could not return nearby places. No automatic retry was made." };
      const places = parseGeoapify(await res.json(), city);
      if (!places) return { ...base, status: "unavailable", note: "Geoapify returned an unexpected response." };
      return { ...base, status: "ok", places, fetchedAt: new Date().toISOString(), note: "Sights near the catalog city centre, not a confirmed venue or hotel. Fees, opening hours and availability are unknown." };
    } catch {
      return { ...base, status: "unavailable", note: "Nearby places timed out or could not be fetched. No automatic retry was made." };
    }
  }, (value) => value.status === "ok");
  if ("blocked" in lookup) return { response: { ...base, status: "quota", note: "Geoapify's local call limit was reached." }, spentProviderCall: false };
  return { response: { ...lookup.value, fromCache: lookup.fromCache }, spentProviderCall: lookup.spentProviderCall };
}
