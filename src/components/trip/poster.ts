import type { HeroResponse, RouteOption } from "@/contract/trip";

/** Only public web images may be displayed or exported; never accept script/data URLs or credentials. */
export function safePosterUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function posterResult(response: HeroResponse, routeId: string) {
  if (response.routeId !== routeId) throw new Error("The artwork belongs to another route.");
  const image = response.heroImage;
  if (image.status === "queued") return { status: "queued" as const };
  const url = safePosterUrl(image.url);
  if (image.status !== "ready" || !url) throw new Error("No usable artwork was returned.");
  return { status: "ready" as const, url, cached: response.cached };
}

export function posterCities(option: RouteOption): string[] {
  const cities = option.citySequence.filter((stop) => stop.purpose !== "origin").map((stop) => stop.city);
  return [...new Set(cities.length ? cities : [option.event.city])];
}

export function routeDates(option: RouteOption) {
  return {
    start: option.legs[0]?.departureDate ?? option.citySequence[0]?.arrivalDate ?? option.event.startDate,
    end: option.legs.at(-1)?.arrivalDate ?? option.citySequence.at(-1)?.departureDate ?? option.event.endDate,
  };
}
