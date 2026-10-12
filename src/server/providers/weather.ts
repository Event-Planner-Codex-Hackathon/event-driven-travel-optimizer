/**
 * Daily forecast from Open-Meteo (no key; free for non-commercial use with
 * attribution). Dates past the ~16-day forecast horizon are reported as such,
 * never filled with guesses.
 */
import type { WeatherDay, WeatherResponse } from "@/contract/trip";
import { findCity } from "../catalog";
import { addDays, diffDays, eachDate, isValidDate, todayLocal } from "../dates";

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const DAILY = "temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code";
/** forecast_days max is 16, counting today. */
const HORIZON_DAYS = 15;
const CACHE_TTL_MS = 60 * 60_000;
const TIMEOUT_MS = 5_000;
export const MAX_WEATHER_DAYS = 21;

const ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)";

const WMO: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle", 56: "Light freezing drizzle", 57: "Dense freezing drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain", 66: "Light freezing rain", 67: "Heavy freezing rain",
  71: "Slight snowfall", 73: "Moderate snowfall", 75: "Heavy snowfall", 77: "Snow grains",
  80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers", 85: "Slight snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
};

type CacheEntry = { expires: number; days: WeatherDay[]; fetchedAt: string };
const g = globalThis as typeof globalThis & { __eventhopperWeather?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> = (g.__eventhopperWeather ??= new Map());

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function parseOpenMeteo(json: unknown): WeatherDay[] | null {
  const daily = (json as { daily?: Record<string, unknown[]> } | null)?.daily;
  if (!daily || !Array.isArray(daily.time)) return null;
  return daily.time.map((date, i): WeatherDay => {
    if (typeof date !== "string" || !isValidDate(date)) return { date: String(date), status: "unavailable" };
    const tempMaxC = num(daily.temperature_2m_max?.[i]);
    const tempMinC = num(daily.temperature_2m_min?.[i]);
    const code = num(daily.weather_code?.[i]);
    if (tempMaxC === undefined || tempMinC === undefined || code === undefined || !(code in WMO)) return { date, status: "unavailable" };
    return {
      date: String(date),
      status: "forecast",
      tempMaxC,
      tempMinC,
      precipitationProbabilityMax: num(daily.precipitation_probability_max?.[i]),
      precipitationMm: num(daily.precipitation_sum?.[i]),
      weatherCode: code,
      summary: code !== undefined ? WMO[code] : undefined,
    };
  });
}

export type WeatherResult = { ok: true; response: WeatherResponse } | { ok: false; message: string };

export async function getWeather(
  q: { city: string; start: string; end: string },
  opts: { fetcher?: typeof fetch; today?: string; now?: number } = {},
): Promise<WeatherResult> {
  const city = findCity(q.city);
  if (!city) return { ok: false, message: `Unknown city "${q.city}".` };
  if (!isValidDate(q.start) || !isValidDate(q.end)) return { ok: false, message: "Invalid calendar date." };
  if (q.end < q.start) return { ok: false, message: "end must not be before start." };
  if (diffDays(q.start, q.end) + 1 > MAX_WEATHER_DAYS) return { ok: false, message: `Ask for at most ${MAX_WEATHER_DAYS} days.` };
  const dates = eachDate(q.start, q.end);

  const today = opts.today ?? todayLocal("UTC");
  const horizon = addDays(today, HORIZON_DAYS);
  const from = q.start < today ? today : q.start;
  const to = q.end > horizon ? horizon : q.end;
  const base = { city: city.city, source: "open-meteo" as const, forecastHorizon: horizon, attribution: ATTRIBUTION };
  const note = "Forecast for planning context only; it does not change routes, dates or prices.";

  let forecast: WeatherDay[] = [];
  let fetchedAt: string | undefined;
  let failed = false;
  if (from <= to) {
    const key = `${city.city}|${from}|${to}`;
    const now = opts.now ?? Date.now();
    const hit = cache.get(key);
    if (hit && hit.expires > now) {
      forecast = hit.days;
      fetchedAt = hit.fetchedAt;
    } else {
      const url = new URL(ENDPOINT);
      url.search = new URLSearchParams({ latitude: String(city.lat), longitude: String(city.lon), daily: DAILY, timezone: "auto", start_date: from, end_date: to }).toString();
      try {
        const res = await (opts.fetcher ?? fetch)(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
        const parsed = res.ok ? parseOpenMeteo(await res.json()) : null;
        if (parsed) {
          forecast = parsed;
          fetchedAt = new Date(now).toISOString();
          cache.set(key, { expires: now + CACHE_TTL_MS, days: parsed, fetchedAt });
        } else failed = true;
      } catch {
        failed = true;
      }
    }
  }

  const byDate = new Map(forecast.map((d) => [d.date, d]));
  const days: WeatherDay[] = dates.map((date) =>
    byDate.get(date) ?? { date, status: date > horizon ? "beyond_forecast" : "unavailable" },
  );
  return {
    ok: true,
    response: {
      ...base,
      days,
      ...(fetchedAt ? { fetchedAt } : {}),
      note: failed ? `Weather service unavailable right now. ${note}` : note,
    },
  };
}

/** Test helper. */
export function resetWeatherCache(): void {
  cache.clear();
}
