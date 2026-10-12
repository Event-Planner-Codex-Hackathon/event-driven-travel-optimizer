import { describe, expect, it } from "vitest";
import type { HeroResponse, RouteOption } from "@/contract/trip";
import { posterCities, posterResult, routeDates, safePosterUrl } from "../poster";

const response: HeroResponse = { routeId: "route-a", cached: true, heroImage: { status: "ready", url: "https://cdn.example.com/art.jpg" } };

describe("poster response protection", () => {
  it("rejects a response for a different route before displaying artwork", () => {
    expect(() => posterResult(response, "route-b")).toThrow(/another route/);
  });
  it("does not treat queued or failed generation as ready artwork", () => {
    expect(posterResult({ ...response, heroImage: { status: "queued" } }, "route-a")).toEqual({ status: "queued" });
    expect(() => posterResult({ ...response, heroImage: { status: "failed", url: response.heroImage.url } }, "route-a")).toThrow();
  });
  it("keeps cached artwork explicitly marked", () => {
    expect(posterResult(response, "route-a")).toMatchObject({ status: "ready", cached: true });
  });
  it("rejects scripts, credential-bearing URLs, relative URLs and insecure remote hosts", () => {
    for (const url of ["javascript:alert(1)", "data:image/svg+xml,test", "https://user:secret@example.com/art.jpg", "/art.jpg", "http://cdn.example.com/art.jpg"]) {
      expect(safePosterUrl(url)).toBeNull();
    }
    expect(() => posterResult({ ...response, heroImage: { status: "ready", url: "javascript:alert(1)" } }, "route-a")).toThrow();
  });
});

describe("poster itinerary facts", () => {
  const option = {
    event: { name: "SWITCH", city: "Singapore", startDate: "2026-10-27", endDate: "2026-10-29", locked: true },
    citySequence: [
      { city: "Istanbul", purpose: "origin", arrivalDate: "2026-10-21", departureDate: "2026-10-21" },
      { city: "Bangkok", purpose: "stopover", arrivalDate: "2026-10-22", departureDate: "2026-10-26" },
      { city: "Singapore", purpose: "event", arrivalDate: "2026-10-26", departureDate: "2026-10-30" },
      { city: "Istanbul", purpose: "origin", arrivalDate: "2026-10-31", departureDate: "2026-10-31" },
    ],
    legs: [
      { departureDate: "2026-10-21", arrivalDate: "2026-10-22" },
      { departureDate: "2026-10-30", arrivalDate: "2026-10-31" },
    ],
  } as RouteOption;
  it("uses the return arrival date, including overnight travel", () => {
    expect(routeDates(option)).toEqual({ start: "2026-10-21", end: "2026-10-31" });
  });
  it("keeps the selected route order without adding the departure city to the destination artwork", () => {
    expect(posterCities(option)).toEqual(["Bangkok", "Singapore"]);
    expect(posterCities({ ...option, citySequence: option.citySequence.filter((s) => s.city !== "Bangkok") })).toEqual(["Singapore"]);
  });
});
