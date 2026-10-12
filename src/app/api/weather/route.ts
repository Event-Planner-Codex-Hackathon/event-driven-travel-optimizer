import { NextResponse } from "next/server";
import { weatherQuerySchema, type WeatherResponse } from "@/contract/trip";
import { apiError } from "@/server/http";
import { getWeather } from "@/server/providers/weather";

export const runtime = "nodejs";

/** Daily forecast for one catalog city and date range (decorative context). */
export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = weatherQuerySchema.safeParse(params);
  if (!parsed.success) return apiError(400, "invalid_body", "Expected ?city=&start=YYYY-MM-DD&end=YYYY-MM-DD.", parsed.error.issues);
  const result = await getWeather(parsed.data);
  if (!result.ok) return apiError(400, "invalid_body", result.message);
  return NextResponse.json<WeatherResponse>(result.response);
}
