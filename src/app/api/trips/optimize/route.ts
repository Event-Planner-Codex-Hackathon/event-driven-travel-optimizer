import { NextResponse } from "next/server";
import { optimizeBodySchema, type TripResponse } from "@/contract/trip";
import { apiError, readBodyOr413 } from "@/server/http";
import { optimizeTrip } from "@/server/trips";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await readBodyOr413(req);
  if (!body.ok) return body.response;
  const parsed = optimizeBodySchema.safeParse(body.body);
  if (!parsed.success) return apiError(400, "invalid_body", "Invalid request body.", parsed.error.issues);
  try {
    return NextResponse.json<TripResponse>(optimizeTrip(parsed.data));
  } catch (err) {
    console.error("optimize failed", err);
    return apiError(500, "internal", "Could not plan this trip.");
  }
}
