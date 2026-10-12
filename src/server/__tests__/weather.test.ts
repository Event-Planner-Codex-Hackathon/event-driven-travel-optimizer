import { beforeEach, describe, expect, it } from "vitest";
import { getWeather, parseOpenMeteo, resetWeatherCache } from "../providers/weather";

const reply = (body: unknown, ok = true) => (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 400 })) as unknown as typeof fetch;
const DAILY = {
  daily: {
    time: ["2026-10-26", "2026-10-27"],
    temperature_2m_max: [31.2, 30.8],
    temperature_2m_min: [25.1, 25.4],
    precipitation_probability_max: [70, 55],
    precipitation_sum: [8.4, 2.1],
    weather_code: [80, 3],
  },
};

beforeEach(() => resetWeatherCache());

describe("Open-Meteo weather", () => {
  it("parses daily arrays and WMO codes", () => {
    expect(parseOpenMeteo(DAILY)![0]).toEqual({ date: "2026-10-26", status: "forecast", tempMaxC: 31.2, tempMinC: 25.1, precipitationProbabilityMax: 70, precipitationMm: 8.4, weatherCode: 80, summary: "Slight rain showers" });
    expect(parseOpenMeteo({ error: true, reason: "x" })).toBeNull();
  });

  it("clips to the forecast horizon and marks later days instead of guessing", async () => {
    let requested = "";
    const fetcher = (async (url: URL) => { requested = String(url); return new Response(JSON.stringify(DAILY)); }) as unknown as typeof fetch;
    const r = await getWeather({ city: "Singapore", start: "2026-10-26", end: "2026-10-29" }, { fetcher, today: "2026-10-12" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(requested).toContain("end_date=2026-10-27");
    expect(r.response.forecastHorizon).toBe("2026-10-27");
    expect(r.response.days.map((d) => d.status)).toEqual(["forecast", "forecast", "beyond_forecast", "beyond_forecast"]);
    expect(r.response.attribution).toMatch(/Open-Meteo/);
  });

  it("makes no call when the whole range is beyond the horizon", async () => {
    let calls = 0;
    const fetcher = (async () => { calls++; return new Response("{}"); }) as unknown as typeof fetch;
    const r = await getWeather({ city: "Bangkok", start: "2026-11-20", end: "2026-11-21" }, { fetcher, today: "2026-10-12" });
    expect(calls).toBe(0);
    expect(r.ok && r.response.days.every((d) => d.status === "beyond_forecast")).toBe(true);
  });

  it("reports provider failure as unavailable days", async () => {
    const r = await getWeather({ city: "Singapore", start: "2026-10-26", end: "2026-10-27" }, { fetcher: reply({ error: true }, false), today: "2026-10-12" });
    expect(r.ok && r.response.days.every((d) => d.status === "unavailable")).toBe(true);
    expect(r.ok && r.response.note).toMatch(/unavailable/);
  });

  it("validates city and range", async () => {
    expect((await getWeather({ city: "Paris", start: "2026-10-26", end: "2026-10-27" })).ok).toBe(false);
    expect((await getWeather({ city: "Singapore", start: "2026-10-27", end: "2026-10-26" })).ok).toBe(false);
  });
});


it("rejects an enormous date range before allocating daily entries", async () => {
  const r = await getWeather({ city: "Singapore", start: "2026-10-12", end: "9999-12-31" });
  expect(r).toMatchObject({ ok: false });
});


it("does not label null daily values as a usable forecast", () => {
  expect(parseOpenMeteo({ daily: { time: ["2026-10-26"], temperature_2m_max: [null], temperature_2m_min: [null], weather_code: [null] } })).toEqual([{ date: "2026-10-26", status: "unavailable" }]);
});
